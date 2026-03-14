import { getChains as getLifiChains, getQuote as getLifiQuote, getNativePermit } from "@lifi/sdk";
import type { LiFiStep } from "@lifi/sdk";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { RePermitOrder } from "@orbs-network/twap-sdk";
import {
  createClient,
  encodeFunctionData,
  maxUint256,
  parseAbi,
  parseSignature,
  publicActions,
  zeroAddress,
} from "viem";
import { parseAccount } from "viem/accounts";
import { ChainAccess } from "../operations/chain-access.js";
import {
  assertAddress,
  assertHex,
  assertInteger,
  assertRecord,
  parseBigIntString,
  preserveWeb3AgentError,
} from "../operations/validation.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../orbs/chains.js";
import { SWAP_PREPARATION_ABI, type SwapResult } from "../orbs/liquidity-hub.js";
import {
  PERMIT2_ADDRESS,
  getIntentQuote,
  getWrappedNativeToken,
  isNativeTokenAddress,
  normalizeEip712ForSigning,
  resolveSwapQuoteFromToken,
  submitSwap,
} from "../orbs/liquidity-hub.js";
import {
  getSrcTokenChunkAmount,
  getTwapDurationSeconds,
  prepareTwapOrder,
  submitSignedOrder,
} from "../orbs/twap.js";
import { joinSignature, splitSignature } from "../utils/signature.js";
import { Web3AgentError } from "./errors.js";
import {
  operationActionResultsMapSchema,
  operationResumeStateSchema,
  orbsGetRequiredApprovalsSchema,
  prepareOperationSchema,
  resumeOperationSchema,
} from "./schemas.js";
import type {
  ApprovalStep,
  BridgeIntent,
  BridgeTxStep,
  GetRequiredApprovalsInput,
  GoatToolOperationInput,
  LimitIntent,
  OperationActionResult,
  OperationResumeState,
  PrepareBridgeIntentInput,
  PrepareLimitIntentInput,
  PrepareOperationInput,
  PrepareOperationResult,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  PreparedAction,
  PreparedOperation,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
  ResumeOperationCompletedResult,
  ResumeOperationInput,
  ResumeOperationResult,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
  TypedDataPayload,
} from "./types.js";
import { parseInput } from "./validation.js";

const LIFI_PERMIT2_PROXY_ABI = parseAbi([
  "function callDiamondWithPermit2(bytes, ((address, uint256), uint256, uint256), bytes) external",
  "function callDiamondWithEIP2612Signature(address, uint256, uint256, uint8, bytes32, bytes32, bytes) external payable",
  "function nextNonce(address) external view returns (uint256)",
  "function callDiamondWithPermit2Witness(bytes, address, ((address, uint256), uint256, uint256), bytes) external payable",
]);

const LIFI_PERMIT2_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} satisfies TypedDataPayload["types"];

let lifiChainsPromise: Promise<ExtendedChain[]> | undefined;

type LifiBridgeFinalization =
  | { kind: "none" }
  | {
      kind: "nativePermit";
      signatureActionId: string;
      tokenAddress: `0x${string}`;
      amount: string;
      deadline: string;
      permit2Proxy: `0x${string}`;
    }
  | {
      kind: "permit2";
      signatureActionId: string;
      tokenAddress: `0x${string}`;
      amount: string;
      nonce: string;
      deadline: string;
      permit2: `0x${string}`;
      permit2Proxy: `0x${string}`;
      account: `0x${string}`;
      witness: boolean;
    };

interface ExtendedChain {
  id: number;
  diamondAddress?: string;
  permit2?: string;
  permit2Proxy?: string;
}

interface LifiTypedData {
  primaryType: string;
  domain: Record<string, unknown>;
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

interface LifiTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  chainId?: number;
}

interface RawOrbsQuote extends Quote {
  sessionId: string;
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  minAmountOut: string;
  user: string;
  permitData?: Record<string, unknown>;
  eip712?: {
    domain?: Record<string, unknown>;
    types?: Record<string, Array<{ name: string; type: string }>>;
    primaryType?: string;
    message?: Record<string, unknown>;
  };
}

function isSourceChainPermit(typedData: LifiTypedData, chainId: number): boolean {
  return (
    typedData.primaryType === "Permit" &&
    Number((typedData.domain as Record<string, unknown>).chainId) === chainId
  );
}

function normalizeLifiTypedData(typedData: LifiTypedData): TypedDataPayload {
  return {
    domain: typedData.domain as Record<string, unknown>,
    types: Object.fromEntries(
      Object.entries(typedData.types).map(([typeName, entries]) => [
        typeName,
        entries.map((entry) => ({ name: entry.name, type: entry.type })),
      ])
    ),
    primaryType: typedData.primaryType,
    message: typedData.message as Record<string, unknown>,
  };
}

function createTypedDataActions(
  prefix: string,
  chainId: number,
  typedDataList: LifiTypedData[]
): PreparedSignTypedDataAction[] {
  return typedDataList.map((typedData, index) => {
    const eip712 = normalizeLifiTypedData(typedData);
    const label =
      eip712.primaryType === "Permit"
        ? "Sign permit"
        : eip712.primaryType.startsWith("Permit")
          ? "Sign Permit2 authorization"
          : "Sign bridge typed data";

    return {
      id: `${prefix}:${index}`,
      type: "signTypedData",
      label,
      chainId,
      eip712,
    };
  });
}

function toBridgeStepLabel(type: BridgeTxStep["type"]): string {
  return type === "approval" ? "Approve bridge spender" : "Execute bridge";
}

function toSwapIntentQuote(quote: RawOrbsQuote): SwapIntent["quote"] {
  return {
    ...quote,
    sessionId: quote.sessionId,
    inToken: quote.inToken,
    outToken: quote.outToken,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    minAmountOut: quote.minAmountOut,
    user: quote.user,
  };
}

function createPreparedApprovalActions(
  chainId: number,
  approvals: ApprovalStep[]
): PreparedTransactionAction[] {
  return approvals.map((step, index) => ({
    id: `approval:${index}`,
    type: "transaction",
    label: step.label,
    tx: {
      to: step.tx.to,
      chainId,
      ...(step.tx.data ? { data: step.tx.data } : {}),
      ...(step.tx.value ? { value: step.tx.value } : {}),
    },
  }));
}

function createTypedDataAction(
  chainId: number,
  label: string,
  eip712: TypedDataPayload
): PreparedSignTypedDataAction {
  return {
    id: "sign-typed-data:0",
    type: "signTypedData",
    label,
    chainId,
    eip712,
  };
}

function createPreparedTransactionActionFromRequest(
  id: string,
  label: string,
  request: LifiTransactionRequest,
  fallbackChainId: number
): PreparedTransactionAction {
  if (!request.to) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge step did not include a destination address",
    });
  }

  return {
    id,
    type: "transaction",
    label,
    tx: {
      to: assertAddress(request.to, "transactionRequest.to"),
      chainId: request.chainId ?? fallbackChainId,
      ...(request.data ? { data: assertHex(request.data, "transactionRequest.data") } : {}),
      value: request.value ?? "0",
      ...(request.gasLimit ? { gasLimit: request.gasLimit } : {}),
    },
  };
}

function createBridgeTxStep(
  type: BridgeTxStep["type"],
  action: PreparedTransactionAction
): BridgeTxStep {
  return {
    type,
    label: action.label,
    tx: action.tx,
  };
}

function createApprovalAction(params: {
  id: string;
  chainId: number;
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  label: string;
}): PreparedTransactionAction {
  return {
    id: params.id,
    type: "transaction",
    label: params.label,
    tx: {
      to: params.tokenAddress,
      chainId: params.chainId,
      data: encodeFunctionData({
        abi: SWAP_PREPARATION_ABI,
        functionName: "approve",
        args: [params.spender, params.amount],
      }),
      value: "0",
    },
  };
}

function buildPreparedOperation(
  integration: PreparedOperation["integration"],
  kind: PreparedOperation["kind"],
  summary: string,
  actions: PreparedOperation["actions"],
  state: Record<string, unknown>,
  meta?: Record<string, unknown>
): PreparedOperation {
  return {
    integration,
    kind,
    summary,
    actions,
    resumeState: {
      version: 1,
      integration,
      kind,
      state: {
        ...state,
        actionResults:
          state.actionResults && typeof state.actionResults === "object" ? state.actionResults : {},
        ...(meta ? { meta } : {}),
      },
    },
    ...(meta ? { meta } : {}),
  };
}

function getStoredActionResults(
  state: Record<string, unknown>
): Record<string, OperationActionResult> {
  if (state.actionResults === undefined) {
    return {};
  }

  return parseInput(operationActionResultsMapSchema, state.actionResults);
}

function mergeActionResults(
  state: Record<string, unknown>,
  actionResults?: Record<string, OperationActionResult>
): Record<string, OperationActionResult> {
  return {
    ...getStoredActionResults(state),
    ...(actionResults ?? {}),
  };
}

function assertPreparedActionResult(
  actionResults: Record<string, OperationActionResult>,
  action: PreparedAction
): OperationActionResult | undefined {
  if (action.type === "transaction") {
    return assertActionResultType(actionResults, action.id, "transaction");
  }

  if (action.type === "signTypedData") {
    return assertActionResultType(actionResults, action.id, "signature");
  }

  const result = actionResults[action.id];
  if (!result) return undefined;
  if (result.type !== "messageSignature" && result.type !== "signature") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${action.id} must be a message signature`,
    });
  }
  return result;
}

function getPendingPreparedActions(
  actions: PreparedAction[],
  actionResults: Record<string, OperationActionResult>
): PreparedAction[] {
  return actions.filter((action) => !assertPreparedActionResult(actionResults, action));
}

async function getLifiExtendedChain(chainId: number): Promise<ExtendedChain> {
  lifiChainsPromise ??= getLifiChains();
  const chains = await lifiChainsPromise;
  const chain = chains.find((candidate) => candidate.id === chainId);

  if (!chain) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: `LI.FI does not support chain ${chainId}`,
    });
  }

  return chain;
}

function getPermit2Domain(permit2: `0x${string}`, chainId: number): TypedDataPayload["domain"] {
  return {
    name: "Permit2",
    chainId,
    verifyingContract: permit2,
  };
}

async function buildLifiReadClient(
  account: `0x${string}`,
  chainId: number,
  chainAccess: ChainAccess
) {
  return createClient({
    account: parseAccount(account),
    chain: chainAccess.getChain(chainId),
    transport: chainAccess.getTransport(chainId),
  }).extend(publicActions);
}

async function getPermit2TypedData(params: {
  account: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: bigint;
  chain: ExtendedChain;
  chainAccess: ChainAccess;
}): Promise<{
  typedData: TypedDataPayload;
  nonce: string;
  deadline: string;
}> {
  if (!params.chain.permit2 || !params.chain.permit2Proxy || !params.chain.diamondAddress) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: `Permit2 metadata is missing for chain ${params.chain.id}`,
    });
  }

  const client = await buildLifiReadClient(params.account, params.chain.id, params.chainAccess);
  const nonce = await client.readContract({
    address: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
    abi: LIFI_PERMIT2_PROXY_ABI,
    functionName: "nextNonce",
    args: [params.account],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

  return {
    typedData: {
      domain: getPermit2Domain(
        assertAddress(params.chain.permit2, "fromChain.permit2"),
        params.chain.id
      ),
      types: LIFI_PERMIT2_TYPES,
      primaryType: "PermitTransferFrom",
      message: {
        permitted: {
          token: params.tokenAddress,
          amount: params.amount.toString(),
        },
        spender: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    },
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };
}

function rewriteFinalBridgeAction(
  finalAction: PreparedTransactionAction,
  finalization: LifiBridgeFinalization,
  actionResults: Record<string, OperationActionResult>
): PreparedTransactionAction {
  if (finalization.kind === "none") {
    return finalAction;
  }

  const signatureResult = assertActionResultType(
    actionResults,
    finalization.signatureActionId,
    "signature"
  );
  if (!signatureResult) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Missing signature result for ${finalization.signatureActionId}`,
    });
  }

  if (!finalAction.tx.data) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction is missing calldata for permit wrapping",
    });
  }

  const signature = assertHex(signatureResult.signature, "actionResults.signature");

  if (finalization.kind === "nativePermit") {
    const { v, r, s } = parseSignature(signature);
    return {
      ...finalAction,
      tx: {
        ...finalAction.tx,
        to: finalization.permit2Proxy,
        data: encodeFunctionData({
          abi: LIFI_PERMIT2_PROXY_ABI,
          functionName: "callDiamondWithEIP2612Signature",
          args: [
            finalization.tokenAddress,
            parseBigIntString(finalization.amount, "resumeState.state.finalization.amount"),
            parseBigIntString(finalization.deadline, "resumeState.state.finalization.deadline"),
            Number(v),
            r,
            s,
            finalAction.tx.data,
          ],
        }),
      },
    };
  }

  return {
    ...finalAction,
    tx: {
      ...finalAction.tx,
      to: finalization.permit2Proxy,
      data: encodeFunctionData({
        abi: LIFI_PERMIT2_PROXY_ABI,
        functionName: finalization.witness
          ? "callDiamondWithPermit2Witness"
          : "callDiamondWithPermit2",
        args: finalization.witness
          ? [
              finalAction.tx.data,
              finalization.account,
              [
                [
                  finalization.tokenAddress,
                  parseBigIntString(finalization.amount, "resumeState.state.finalization.amount"),
                ],
                parseBigIntString(finalization.nonce, "resumeState.state.finalization.nonce"),
                parseBigIntString(finalization.deadline, "resumeState.state.finalization.deadline"),
              ],
              signature,
            ]
          : [
              finalAction.tx.data,
              [
                [
                  finalization.tokenAddress,
                  parseBigIntString(finalization.amount, "resumeState.state.finalization.amount"),
                ],
                parseBigIntString(finalization.nonce, "resumeState.state.finalization.nonce"),
                parseBigIntString(finalization.deadline, "resumeState.state.finalization.deadline"),
              ],
              signature,
            ],
      }),
    },
  };
}

function assertActionResultType<TType extends OperationActionResult["type"]>(
  actionResults: Record<string, OperationActionResult>,
  actionId: string,
  expectedType: TType
): Extract<OperationActionResult, { type: TType }> | undefined {
  const result = actionResults[actionId];
  if (!result) return undefined;
  if (result.type !== expectedType) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${actionId} must be of type ${expectedType}`,
    });
  }
  return result as Extract<OperationActionResult, { type: TType }>;
}

function assertSubmitSwapQuote(quote: unknown): Record<string, unknown> {
  const record = assertRecord(quote, "quote");
  const requiredFields = [
    "sessionId",
    "inToken",
    "outToken",
    "inAmount",
    "outAmount",
    "minAmountOut",
    "user",
  ] as const;

  for (const field of requiredFields) {
    if (typeof record[field] !== "string") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `quote.${field} must be a string`,
      });
    }
  }

  return record;
}

function assertSignedOrder(order: unknown): Record<string, unknown> {
  return assertRecord(order, "order");
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const chainAccess = new ChainAccess();
  const publicClient = chainAccess.createPublicClient(input.chainId);

  try {
    const steps: ApprovalStep[] = [];
    let effectiveFromToken = assertAddress(input.fromToken, "fromToken");

    if (isNativeTokenAddress(input.fromToken)) {
      const wrapped = getWrappedNativeToken(input.chainId);
      if (!wrapped) {
        throw new Web3AgentError({
          code: "CHAIN_NOT_SUPPORTED",
          message: `No wrapped native token configured for chain ${input.chainId}`,
        });
      }

      steps.push({
        type: "wrap",
        label: "Wrap native token",
        tx: {
          to: wrapped,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "deposit",
          }),
          value: input.inAmount,
        },
      });
      effectiveFromToken = wrapped;
    }

    const allowance = await publicClient.readContract({
      address: effectiveFromToken,
      abi: SWAP_PREPARATION_ABI,
      functionName: "allowance",
      args: [assertAddress(input.account, "account"), PERMIT2_ADDRESS],
    });

    if ((allowance as bigint) < BigInt(input.inAmount)) {
      steps.push({
        type: "approve",
        label: "Approve Permit2 (unlimited allowance)",
        tx: {
          to: effectiveFromToken,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "approve",
            args: [PERMIT2_ADDRESS, maxUint256],
          }),
        },
      });
    }

    return steps;
  } catch (error: unknown) {
    throw preserveWeb3AgentError("APPROVAL_CHECK_ERROR", error);
  }
}

async function prepareSwapOperation(input: PrepareSwapIntentInput): Promise<PreparedOperation> {
  if (!isLiquidityHubSupported(input.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getLiquidityHubError(input.chainId),
    });
  }

  try {
    const quote = (await getIntentQuote(input.chainId, {
      fromToken: resolveSwapQuoteFromToken(input.chainId, input.fromToken),
      toToken: input.toToken,
      inAmount: input.inAmount,
      slippage: input.slippage,
      account: input.account,
    })) as RawOrbsQuote;

    const rawPrimaryType = quote.eip712?.primaryType ?? "PermitWitnessTransferFrom";
    const rawMessage = quote.eip712?.message ?? quote.permitData;
    if (!quote.eip712?.domain || !quote.eip712.types || !rawMessage) {
      throw new Web3AgentError({
        code: "ORBS_QUOTE_ERROR",
        message: "Quote did not include EIP-712 signing payload",
      });
    }

    const eip712 = normalizeEip712ForSigning(
      quote.eip712.domain,
      quote.eip712.types,
      rawPrimaryType,
      rawMessage
    );
    const requiredApprovals = await getRequiredApprovals({
      chainId: input.chainId,
      fromToken: input.fromToken,
      inAmount: input.inAmount,
      account: input.account,
    });
    const approvalActions = createPreparedApprovalActions(input.chainId, requiredApprovals);
    const signAction = createTypedDataAction(input.chainId, "Sign swap intent", eip712);
    const intent: SwapIntent = {
      eip712,
      quote: toSwapIntentQuote({
        ...quote,
        user: typeof quote.user === "string" ? quote.user : input.account,
      }),
      requiredApprovals,
      chainId: input.chainId,
    };

    return buildPreparedOperation(
      "orbs",
      "swap",
      `Prepare Orbs swap on chain ${input.chainId}`,
      approvalActions.length > 0 ? approvalActions : [signAction],
      {
        summary: `Prepare Orbs swap on chain ${input.chainId}`,
        intent,
        quote: intent.quote,
        chainId: input.chainId,
        approvalActions,
        signAction,
      },
      {
        intent,
      }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_QUOTE_ERROR", error);
  }
}

function prepareTwapOrLimitIntent(
  kind: "twap" | "limit",
  params: PrepareTwapIntentInput | PrepareLimitIntentInput
): { intent: TwapIntent | LimitIntent; signAction: PreparedSignTypedDataAction } {
  if (!isTwapSupported(params.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getTwapError(params.chainId),
    });
  }

  const isLimit = kind === "limit";
  const expirySeconds = isLimit ? ((params as PrepareLimitIntentInput).expiry ?? 86400) : undefined;
  const chunks = isLimit ? 1 : (params as PrepareTwapIntentInput).chunks;
  const fillDelaySeconds = isLimit ? 0 : (params as PrepareTwapIntentInput).fillDelay;
  const durationSeconds = isLimit
    ? (expirySeconds ?? 86400)
    : getTwapDurationSeconds(chunks, fillDelaySeconds);
  const order = prepareTwapOrder({
    chainId: params.chainId,
    srcToken: params.srcToken,
    dstToken: params.dstToken,
    srcAmount: params.srcAmount,
    chunks,
    fillDelaySeconds,
    durationSeconds,
    account: params.account,
    ...(isLimit
      ? {
          dstMinAmountPerTrade: (params as PrepareLimitIntentInput).dstMinAmount,
        }
      : {}),
  });
  const eip712: TypedDataPayload = {
    domain: order.domain as Record<string, unknown>,
    types: order.types as Record<string, Array<{ name: string; type: string }>>,
    primaryType: order.primaryType,
    message: order.order as unknown as Record<string, unknown>,
  };

  if (isLimit) {
    const intent: LimitIntent = {
      eip712,
      order: order.order as unknown as Record<string, unknown>,
      chainId: params.chainId,
      meta: {
        expirySeconds: expirySeconds ?? 86400,
        dstMinAmount: (params as PrepareLimitIntentInput).dstMinAmount,
      },
    };
    return {
      intent,
      signAction: createTypedDataAction(params.chainId, "Sign limit order", eip712),
    };
  }

  const intent: TwapIntent = {
    eip712,
    order: order.order as unknown as Record<string, unknown>,
    chainId: params.chainId,
    meta: {
      chunks,
      fillDelaySeconds,
      durationSeconds,
      srcAmountPerChunk: getSrcTokenChunkAmount(params.srcAmount, chunks),
    },
  };
  return {
    intent,
    signAction: createTypedDataAction(params.chainId, "Sign TWAP order", eip712),
  };
}

async function prepareTwapOperation(input: PrepareTwapIntentInput): Promise<PreparedOperation> {
  try {
    const { intent, signAction } = prepareTwapOrLimitIntent("twap", input);
    return buildPreparedOperation(
      "orbs",
      "twap",
      `Prepare Orbs TWAP order on chain ${input.chainId}`,
      [signAction],
      {
        summary: `Prepare Orbs TWAP order on chain ${input.chainId}`,
        intent,
        order: intent.order,
        signAction,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_TWAP_ERROR", error);
  }
}

async function prepareLimitOperation(input: PrepareLimitIntentInput): Promise<PreparedOperation> {
  try {
    const { intent, signAction } = prepareTwapOrLimitIntent("limit", input);
    return buildPreparedOperation(
      "orbs",
      "limit",
      `Prepare Orbs limit order on chain ${input.chainId}`,
      [signAction],
      {
        summary: `Prepare Orbs limit order on chain ${input.chainId}`,
        intent,
        order: intent.order,
        signAction,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_LIMIT_ERROR", error);
  }
}

async function prepareBridgeOperation(input: PrepareBridgeIntentInput): Promise<PreparedOperation> {
  try {
    const quote: LiFiStep = await getLifiQuote({
      fromChain: input.fromChainId,
      toChain: input.toChainId,
      fromToken: input.fromTokenAddress,
      toToken: input.toTokenAddress,
      fromAmount: input.fromAmount,
      fromAddress: input.account,
    });
    const summary = `Prepare LI.FI bridge from ${input.fromChainId} to ${input.toChainId}`;
    const finalAction = createPreparedTransactionActionFromRequest(
      "bridge:execute:0",
      toBridgeStepLabel("bridge"),
      (quote.transactionRequest ?? {}) as LifiTransactionRequest,
      input.fromChainId
    );
    const chainAccess = new ChainAccess();
    const account = assertAddress(input.account, "account");
    const fromChain = await getLifiExtendedChain(input.fromChainId);
    const fromTokenAddress = assertAddress(
      quote.action.fromToken.address,
      "quote.action.fromToken"
    );
    const fromAmount = parseBigIntString(quote.action.fromAmount, "quote.action.fromAmount");
    const stages: PreparedAction[][] = [];
    const steps: BridgeTxStep[] = [];
    let finalization: LifiBridgeFinalization = { kind: "none" };

    const initialTypedData = (quote.typedData ?? []) as LifiTypedData[];
    const typedDataActions = createTypedDataActions(
      "bridge:typed-data",
      input.fromChainId,
      initialTypedData
    );
    if (typedDataActions.length > 0) {
      stages.push(typedDataActions);
    }

    const sourceChainPermitIndex = initialTypedData.findIndex((typedData) =>
      isSourceChainPermit(typedData, input.fromChainId)
    );
    if (sourceChainPermitIndex >= 0) {
      const sourcePermit = initialTypedData[sourceChainPermitIndex];
      const sourcePermitAction = typedDataActions[sourceChainPermitIndex];
      const deadline = sourcePermit?.message.deadline;
      if (deadline === undefined || !fromChain.permit2Proxy || !sourcePermitAction) {
        throw new Web3AgentError({
          code: "BRIDGE_INTENT_ERROR",
          message: "Bridge permit metadata is incomplete",
        });
      }

      finalization = {
        kind: "nativePermit",
        signatureActionId: sourcePermitAction.id,
        tokenAddress: fromTokenAddress,
        amount: fromAmount.toString(),
        deadline: String(deadline),
        permit2Proxy: assertAddress(fromChain.permit2Proxy, "fromChain.permit2Proxy"),
      };
    } else {
      const needsAllowanceCheck =
        fromTokenAddress.toLowerCase() !== zeroAddress &&
        !!quote.estimate?.approvalAddress &&
        !quote.estimate?.skipApproval;
      const permit2Eligible =
        needsAllowanceCheck &&
        !!fromChain.permit2 &&
        !!fromChain.permit2Proxy &&
        !quote.estimate?.skipPermit;

      if (needsAllowanceCheck) {
        const permit2Address = fromChain.permit2;
        const approvalAddress = quote.estimate?.approvalAddress;
        const spenderAddress = assertAddress(
          permit2Eligible ? (permit2Address ?? "") : (approvalAddress ?? ""),
          permit2Eligible ? "fromChain.permit2" : "quote.estimate.approvalAddress"
        );
        const publicClient = chainAccess.createPublicClient(input.fromChainId);
        const allowance = (await publicClient.readContract({
          address: fromTokenAddress,
          abi: SWAP_PREPARATION_ABI,
          functionName: "allowance",
          args: [account, spenderAddress],
        })) as bigint;

        if (fromAmount > allowance) {
          if (fromChain.permit2Proxy && !quote.estimate?.skipPermit) {
            const client = await buildLifiReadClient(account, input.fromChainId, chainAccess);
            const nativePermitData = await getNativePermit(client, {
              chainId: input.fromChainId,
              tokenAddress: fromTokenAddress,
              spenderAddress: assertAddress(fromChain.permit2Proxy, "fromChain.permit2Proxy"),
              amount: fromAmount,
            });

            if (nativePermitData) {
              const nativePermitAction = createTypedDataActions(
                "bridge:native-permit",
                input.fromChainId,
                [nativePermitData]
              )[0];
              if (!nativePermitAction) {
                throw new Web3AgentError({
                  code: "BRIDGE_INTENT_ERROR",
                  message: "Native permit action generation failed",
                });
              }
              stages.push([nativePermitAction]);
              finalization = {
                kind: "nativePermit",
                signatureActionId: nativePermitAction.id,
                tokenAddress: fromTokenAddress,
                amount: fromAmount.toString(),
                deadline: String(nativePermitData.message.deadline),
                permit2Proxy: assertAddress(fromChain.permit2Proxy, "fromChain.permit2Proxy"),
              };
            }
          }

          if (finalization.kind === "none") {
            const approvalActions: PreparedTransactionAction[] = [];

            if (quote.estimate?.approvalReset && allowance > 0n) {
              approvalActions.push(
                createApprovalAction({
                  id: "bridge:approval-reset:0",
                  chainId: input.fromChainId,
                  tokenAddress: fromTokenAddress,
                  spender: spenderAddress,
                  amount: 0n,
                  label: "Reset bridge spender approval",
                })
              );
            }

            approvalActions.push(
              createApprovalAction({
                id: "bridge:approval:0",
                chainId: input.fromChainId,
                tokenAddress: fromTokenAddress,
                spender: spenderAddress,
                amount: permit2Eligible ? maxUint256 : fromAmount,
                label: permit2Eligible
                  ? "Approve Permit2 (unlimited allowance)"
                  : toBridgeStepLabel("approval"),
              })
            );

            stages.push(approvalActions);
            steps.push(...approvalActions.map((action) => createBridgeTxStep("approval", action)));
          }
        }

        if (finalization.kind === "none" && permit2Eligible) {
          const permit2 = await getPermit2TypedData({
            account,
            tokenAddress: fromTokenAddress,
            amount: fromAmount,
            chain: fromChain,
            chainAccess,
          });
          const permit2Action: PreparedSignTypedDataAction = {
            id: "bridge:permit2:0",
            type: "signTypedData",
            label: "Sign Permit2 authorization",
            chainId: input.fromChainId,
            eip712: permit2.typedData,
          };
          stages.push([permit2Action]);
          finalization = {
            kind: "permit2",
            signatureActionId: permit2Action.id,
            tokenAddress: fromTokenAddress,
            amount: fromAmount.toString(),
            nonce: permit2.nonce,
            deadline: permit2.deadline,
            permit2: assertAddress(fromChain.permit2 ?? "", "fromChain.permit2"),
            permit2Proxy: assertAddress(fromChain.permit2Proxy ?? "", "fromChain.permit2Proxy"),
            account,
            witness: false,
          };
        }
      }
    }

    steps.push(createBridgeTxStep("bridge", finalAction));
    const actions = [...stages.flat(), finalAction];
    const intent: BridgeIntent = {
      steps,
      actions,
      estimate: {
        fromToken: quote.action.fromToken?.symbol ?? input.fromTokenAddress,
        toToken: quote.action.toToken?.symbol ?? input.toTokenAddress,
        fromAmount: quote.action.fromAmount,
        fromAmountUSD: quote.estimate?.fromAmountUSD,
        toAmount: quote.estimate?.toAmount ?? "0",
        toAmountUSD: quote.estimate?.toAmountUSD,
        toAmountMin: quote.estimate?.toAmountMin ?? "0",
        gasCostUSD: quote.estimate?.gasCosts?.[0]?.amountUSD,
        estimatedDurationSeconds: quote.estimate?.executionDuration,
      },
      fromChainId: input.fromChainId,
      toChainId: input.toChainId,
    };

    return buildPreparedOperation(
      "lifi",
      "bridge",
      summary,
      stages[0] ?? [finalAction],
      {
        summary,
        intent,
        stages,
        finalAction,
        finalization,
        account,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("BRIDGE_INTENT_ERROR", error);
  }
}

export async function prepareOperation(
  params: PrepareOperationInput
): Promise<PrepareOperationResult> {
  const input = parseInput(prepareOperationSchema, params);

  switch (input.integration) {
    case "orbs":
      if (input.kind === "swap") {
        return prepareSwapOperation(input);
      }
      if (input.kind === "twap") {
        return prepareTwapOperation(input);
      }
      return prepareLimitOperation(input);
    case "lifi":
      return prepareBridgeOperation(input);
    case "goat": {
      const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
      return prepareOrResumeGoatOperation({
        input: input as GoatToolOperationInput,
      });
    }
  }
}

function parseResumeState(resumeState: unknown): OperationResumeState {
  return parseInput(operationResumeStateSchema, resumeState);
}

function toPendingOperation(
  resumeState: OperationResumeState,
  actions: PreparedOperation["actions"],
  fallbackSummary: string,
  actionResults: Record<string, OperationActionResult>
): PreparedOperation {
  const state = assertRecord(resumeState.state, "resumeState.state");
  const summary =
    typeof state.summary === "string" && state.summary.length > 0 ? state.summary : fallbackSummary;
  const meta = state.meta && typeof state.meta === "object" ? { ...(state.meta as object) } : {};
  const nextResumeState: OperationResumeState = {
    ...resumeState,
    state: {
      ...state,
      actionResults,
    },
  };

  return {
    integration: resumeState.integration,
    kind: resumeState.kind,
    summary,
    actions,
    resumeState: nextResumeState,
    ...(Object.keys(meta).length > 0 ? { meta: meta as Record<string, unknown> } : {}),
  };
}

export async function resumeOperation(
  params: ResumeOperationInput
): Promise<ResumeOperationResult> {
  const input = parseInput(resumeOperationSchema, params);
  const resumeState = parseResumeState(input.resumeState);
  const state = assertRecord(resumeState.state, "resumeState.state");
  const actionResults = mergeActionResults(state, input.actionResults);

  if (resumeState.integration === "goat") {
    const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
    const goatInput = parseInput(prepareOperationSchema, {
      integration: "goat",
      kind: "tool",
      toolName: state.toolName,
      params: state.params,
      chainId: state.chainId,
      account: state.account,
    }) as GoatToolOperationInput;
    const result = await prepareOrResumeGoatOperation({
      input: goatInput,
      actionResults,
    });

    if ("completed" in result) {
      return result;
    }

    return {
      completed: false,
      operation: result,
    };
  }

  if (resumeState.integration === "orbs" && resumeState.kind === "swap") {
    const approvalActions = Array.isArray(state.approvalActions)
      ? (state.approvalActions as PreparedTransactionAction[])
      : [];
    const pendingApprovals = approvalActions.filter(
      (action) => !assertPreparedActionResult(actionResults, action)
    );
    if (pendingApprovals.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          pendingApprovals,
          "Resume Orbs swap approvals",
          actionResults
        ),
      };
    }

    const signAction = state.signAction as PreparedSignTypedDataAction | undefined;
    if (!signAction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "Swap resume state is missing signAction",
      });
    }

    const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
    if (!signatureResult) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          [signAction],
          "Resume Orbs swap signing",
          actionResults
        ),
      };
    }

    const quote = assertSubmitSwapQuote(state.quote);
    const result: SwapResult = await submitSwap({
      chainId: assertInteger(state.chainId, "resumeState.state.chainId"),
      quote: quote as unknown as Quote,
      signature: signatureResult.signature,
    });
    return {
      completed: true,
      integration: "orbs",
      kind: "swap",
      result: { ...result },
    };
  }

  if (
    resumeState.integration === "orbs" &&
    (resumeState.kind === "twap" || resumeState.kind === "limit")
  ) {
    const signAction = state.signAction as PreparedSignTypedDataAction | undefined;
    if (!signAction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `${resumeState.kind} resume state is missing signAction`,
      });
    }

    const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
    if (!signatureResult) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          [signAction],
          `Resume Orbs ${resumeState.kind} signing`,
          actionResults
        ),
      };
    }

    const signature = splitSignature(signatureResult.signature);
    const order = assertSignedOrder(state.order);
    const submittedOrder = await submitSignedOrder(order as unknown as RePermitOrder, signature);
    const result: TwapOrderResult = {
      orderId: submittedOrder.id,
      status: submittedOrder.status,
      ...(submittedOrder.txHash ? { txHash: submittedOrder.txHash } : {}),
    };
    return {
      completed: true,
      integration: "orbs",
      kind: resumeState.kind,
      result: { ...result },
    };
  }

  if (resumeState.integration === "lifi" && resumeState.kind === "bridge") {
    const stages = Array.isArray(state.stages)
      ? state.stages.map((stage, index) => {
          if (!Array.isArray(stage)) {
            throw new Web3AgentError({
              code: "INVALID_PARAMS",
              message: `resumeState.state.stages[${index}] must be an array`,
            });
          }
          return stage as PreparedAction[];
        })
      : [];
    const finalAction = state.finalAction as PreparedTransactionAction | undefined;
    if (!finalAction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "Bridge resume state is missing finalAction",
      });
    }
    const finalization =
      state.finalization && typeof state.finalization === "object"
        ? (state.finalization as LifiBridgeFinalization)
        : ({ kind: "none" } satisfies LifiBridgeFinalization);

    for (const stage of stages) {
      const pendingStageActions = getPendingPreparedActions(stage, actionResults);
      if (pendingStageActions.length > 0) {
        return {
          completed: false,
          operation: toPendingOperation(
            resumeState,
            pendingStageActions,
            "Resume LI.FI bridge",
            actionResults
          ),
        };
      }
    }

    const rewrittenFinalAction = rewriteFinalBridgeAction(finalAction, finalization, actionResults);
    const finalTransaction = assertActionResultType(
      actionResults,
      rewrittenFinalAction.id,
      "transaction"
    );
    if (!finalTransaction) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          [rewrittenFinalAction],
          "Resume LI.FI bridge",
          actionResults
        ),
      };
    }

    return {
      completed: true,
      integration: "lifi",
      kind: "bridge",
      result: {
        status: "completed",
        message: "Bridge steps executed externally",
        txHash: finalTransaction.txHash,
      },
    };
  }

  throw new Web3AgentError({
    code: "INVALID_PARAMS",
    message: `Unsupported resume state: ${resumeState.integration}/${resumeState.kind}`,
  });
}

export async function submitSignedSwap(params: {
  chainId: number;
  quote: Record<string, unknown>;
  signature: string;
}): Promise<SwapSubmissionResult> {
  const result = await resumeOperation({
    resumeState: {
      version: 1,
      integration: "orbs",
      kind: "swap",
      state: {
        chainId: params.chainId,
        quote: assertSubmitSwapQuote(params.quote),
        approvalActions: [],
        signAction: {
          id: "sign-typed-data:0",
          type: "signTypedData",
          label: "Sign swap intent",
          chainId: params.chainId,
          eip712: {
            domain: {},
            types: {},
            primaryType: "PermitWitnessTransferFrom",
            message: {},
          },
        },
      },
    },
    actionResults: {
      "sign-typed-data:0": {
        type: "signature",
        signature: params.signature,
      },
    },
  });

  if (!result.completed) {
    throw new Web3AgentError({
      code: "ORBS_SWAP_ERROR",
      message: "Signed swap did not complete",
    });
  }

  return result.result as unknown as SwapSubmissionResult;
}

export async function submitSignedTwapOrder(params: {
  order: Record<string, unknown>;
  signature: { v: number; r: string; s: string };
}): Promise<TwapOrderResult> {
  let signatureHex: `0x${string}`;
  try {
    signatureHex = joinSignature({
      r: assertHex(params.signature.r, "signature.r"),
      s: assertHex(params.signature.s, "signature.s"),
      v: params.signature.v,
    });
  } catch (error: unknown) {
    throw preserveWeb3AgentError("INVALID_PARAMS", error, "Invalid TWAP signature");
  }

  const result = await resumeOperation({
    resumeState: {
      version: 1,
      integration: "orbs",
      kind: "twap",
      state: {
        order: assertSignedOrder(params.order),
        signAction: {
          id: "sign-typed-data:0",
          type: "signTypedData",
          label: "Sign TWAP order",
          chainId: 0,
          eip712: {
            domain: {},
            types: {},
            primaryType: "RePermitWitnessTransferFrom",
            message: {},
          },
        },
      },
    },
    actionResults: {
      "sign-typed-data:0": {
        type: "signature",
        signature: signatureHex,
      },
    },
  });

  if (!result.completed) {
    throw new Web3AgentError({
      code: "ORBS_TWAP_ERROR",
      message: "Signed order did not complete",
    });
  }

  return result.result as unknown as TwapOrderResult;
}
