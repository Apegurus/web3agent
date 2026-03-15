import type { LiFiStep } from "@lifi/sdk";
import {
  convertQuoteToRoute,
  getChains as getLifiChains,
  getQuote as getLifiQuote,
  setAllowance,
} from "@lifi/sdk";
import {
  createClient,
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseAbi,
  publicActions,
} from "viem";
import { parseAccount } from "viem/accounts";
import { ensureLifiInitialized } from "../../lifi/config.js";
import {
  createPublicClientForRuntimeChain,
  getChainForRuntime,
  getTransportForRuntimeChain,
} from "../../operations/chain-access.js";
import { assertAddress, assertHex, parseBigIntString } from "../../operations/validation.js";
import { isNativeTokenAddress } from "../../orbs/liquidity-hub.js";
import { withTimeout } from "../../utils/timeout.js";
import { Web3AgentError } from "../errors.js";
import { lifiBridgeResumeStateStateSchema } from "../schemas.js";
import type {
  BridgeIntent,
  BridgeTxStep,
  OperationActionResult,
  OperationResumeState,
  PrepareBridgeIntentInput,
  PreparedAction,
  PreparedOperation,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
  ResumeOperationCompletedResult,
  TypedDataPayload,
} from "../types.js";
import { parseInput } from "../validation.js";
import {
  assertActionResultType,
  assertConfirmedTransactionResult,
  buildPreparedOperation,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

const LIFI_PERMIT2_PROXY_ABI = parseAbi([
  "function callDiamondWithPermit2(bytes, ((address, uint256), uint256, uint256), bytes) external",
  "function nextNonce(address) external view returns (uint256)",
  "function callDiamondWithPermit2Witness(bytes, address, ((address, uint256), uint256, uint256), bytes) external payable",
]);

const LIFI_PERMIT2_WITNESS_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  LiFiCall: [
    { name: "diamondAddress", type: "address" },
    { name: "diamondCalldataHash", type: "bytes32" },
  ],
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "LiFiCall" },
  ],
} satisfies TypedDataPayload["types"];

const LIFI_CHAINS_CACHE_TTL_MS = 5 * 60 * 1000;
const LIFI_REQUEST_TIMEOUT_MS = 15_000;

let lifiChainsCache:
  | {
      promise: Promise<ExtendedChain[]>;
      expiresAt: number;
    }
  | undefined;

type LifiBridgeFinalization =
  | { kind: "none" }
  | {
      kind: "permit2";
      signatureActionId: string;
      tokenAddress: `0x${string}`;
      amount: string;
      nonce: string;
      deadline: string;
      permit2Proxy: `0x${string}`;
      account: `0x${string}`;
      witness: true;
      diamondAddress: `0x${string}`;
      diamondCalldataHash: `0x${string}`;
    };

interface ExtendedChain {
  id: number;
  diamondAddress?: string;
  permit2?: string;
  permit2Proxy?: string;
}

interface LifiTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  chainId?: number;
}

interface LifiBridgePreparationContext {
  quote: LiFiStep;
  summary: string;
  account: `0x${string}`;
  fromTokenAddress: `0x${string}`;
  fromAmount: bigint;
  finalAction: PreparedTransactionAction;
  fromChain?: ExtendedChain;
}

function toBridgeStepLabel(type: BridgeTxStep["type"]): string {
  return type === "approval" ? "Approve bridge spender" : "Execute bridge";
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

function createBridgeTxSteps(
  type: BridgeTxStep["type"],
  actions: PreparedTransactionAction[]
): BridgeTxStep[] {
  return actions.map((action) => createBridgeTxStep(type, action));
}

async function createAllowanceAction(params: {
  id: string;
  chainId: number;
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  label: string;
}): Promise<PreparedTransactionAction> {
  const publicClient = createPublicClientForRuntimeChain(params.chainId);
  const data = await setAllowance(
    publicClient,
    params.tokenAddress,
    params.spender,
    params.amount,
    undefined,
    true
  );

  return {
    id: params.id,
    type: "transaction",
    label: params.label,
    tx: {
      to: params.tokenAddress,
      chainId: params.chainId,
      data: assertHex(data, `${params.id}.tx.data`),
      value: "0",
    },
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

function getLifiBridgeTransactionRequest(quote: LiFiStep): LifiTransactionRequest {
  try {
    const route = convertQuoteToRoute(quote);
    const lastStep = [...route.steps]
      .reverse()
      .find((candidate) => candidate.transactionRequest !== undefined);

    if (lastStep?.transactionRequest) {
      return lastStep.transactionRequest as LifiTransactionRequest;
    }
  } catch (error: unknown) {
    // LI.FI route conversion can reject minimal quote payloads; the raw quote transaction request
    // remains a valid fallback for prepared bridge intents in that case.
    void error;
  }

  if (quote.transactionRequest && typeof quote.transactionRequest === "object") {
    return quote.transactionRequest as LifiTransactionRequest;
  }

  throw new Web3AgentError({
    code: "BRIDGE_INTENT_ERROR",
    message: "Bridge quote did not include an executable transaction request",
  });
}

async function fetchLifiQuote(input: PrepareBridgeIntentInput): Promise<LiFiStep> {
  ensureLifiInitialized();
  return withTimeout(
    getLifiQuote({
      fromChain: input.fromChainId,
      toChain: input.toChainId,
      fromToken: input.fromTokenAddress,
      toToken: input.toTokenAddress,
      fromAmount: input.fromAmount,
      fromAddress: input.account,
    }),
    LIFI_REQUEST_TIMEOUT_MS,
    "LI.FI quote"
  );
}

async function getLifiBridgePreparationContext(
  input: PrepareBridgeIntentInput,
  options: { includeFromChain?: boolean } = {}
): Promise<LifiBridgePreparationContext> {
  const quote = await fetchLifiQuote(input);
  const finalAction = createPreparedTransactionActionFromRequest(
    "bridge:execute:0",
    toBridgeStepLabel("bridge"),
    getLifiBridgeTransactionRequest(quote),
    input.fromChainId
  );
  const context: LifiBridgePreparationContext = {
    quote,
    summary: `Prepare LI.FI bridge from ${input.fromChainId} to ${input.toChainId}`,
    account: assertAddress(input.account, "account"),
    fromTokenAddress: assertAddress(
      quote.action.fromToken.address,
      "quote.action.fromToken.address"
    ),
    fromAmount: parseBigIntString(quote.action.fromAmount, "quote.action.fromAmount"),
    finalAction,
  };

  if (options.includeFromChain) {
    context.fromChain = await getLifiExtendedChain(input.fromChainId);
  }

  return context;
}

function createBridgeIntentPayload(
  input: PrepareBridgeIntentInput,
  quote: LiFiStep,
  steps: BridgeTxStep[],
  actions: PreparedAction[]
): BridgeIntent {
  return {
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
}

export function clearLifiChainsCache(): void {
  lifiChainsCache = undefined;
}

async function getCachedLifiChains(): Promise<ExtendedChain[]> {
  ensureLifiInitialized();

  const now = Date.now();
  if (!lifiChainsCache || now >= lifiChainsCache.expiresAt) {
    const cacheEntry = {
      promise: withTimeout(getLifiChains(), LIFI_REQUEST_TIMEOUT_MS, "LI.FI chains").catch(
        (error: unknown) => {
          if (lifiChainsCache === cacheEntry) {
            clearLifiChainsCache();
          }
          throw error;
        }
      ),
      expiresAt: now + LIFI_CHAINS_CACHE_TTL_MS,
    };
    lifiChainsCache = cacheEntry;
  }

  return lifiChainsCache.promise;
}

async function getLifiExtendedChain(chainId: number): Promise<ExtendedChain> {
  const chains = await getCachedLifiChains();
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

function buildLifiReadClient(account: `0x${string}`, chainId: number) {
  return createClient({
    account: parseAccount(account),
    chain: getChainForRuntime(chainId),
    transport: getTransportForRuntimeChain(chainId),
  }).extend(publicActions);
}

async function getPermit2TypedData(params: {
  account: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: bigint;
  chain: ExtendedChain;
  finalAction: PreparedTransactionAction;
}): Promise<{
  typedData: TypedDataPayload;
  nonce: string;
  deadline: string;
  diamondAddress: `0x${string}`;
  diamondCalldataHash: `0x${string}`;
}> {
  if (!params.chain.permit2 || !params.chain.permit2Proxy || !params.chain.diamondAddress) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: `Permit2 metadata is missing for chain ${params.chain.id}`,
    });
  }
  if (!params.finalAction.tx.data) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction is missing calldata for Permit2 witness signing",
    });
  }

  const diamondAddress = assertAddress(params.chain.diamondAddress, "fromChain.diamondAddress");
  if (params.finalAction.tx.to.toLowerCase() !== diamondAddress.toLowerCase()) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction target does not match LI.FI diamond address",
    });
  }

  const client = buildLifiReadClient(params.account, params.chain.id);
  const nonce = await client.readContract({
    address: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
    abi: LIFI_PERMIT2_PROXY_ABI,
    functionName: "nextNonce",
    args: [params.account],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
  const diamondCalldataHash = keccak256(params.finalAction.tx.data);

  return {
    typedData: {
      domain: getPermit2Domain(
        assertAddress(params.chain.permit2, "fromChain.permit2"),
        params.chain.id
      ),
      types: LIFI_PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: params.tokenAddress,
          amount: params.amount.toString(),
        },
        spender: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        witness: {
          diamondAddress,
          diamondCalldataHash,
        },
      },
    },
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    diamondAddress,
    diamondCalldataHash,
  };
}

function needsLifiBridgeApproval(quote: LiFiStep, fromTokenAddress: `0x${string}`): boolean {
  return !isNativeTokenAddress(fromTokenAddress) && !quote.estimate?.skipApproval;
}

function getDefaultLifiApprovalSpender(
  quote: LiFiStep,
  finalAction: PreparedTransactionAction
): `0x${string}` {
  return assertAddress(
    quote.estimate?.approvalAddress ?? finalAction.tx.to,
    quote.estimate?.approvalAddress ? "quote.estimate.approvalAddress" : "bridge.tx.to"
  );
}

async function getLifiApprovalActions(params: {
  chainId: number;
  account: `0x${string}`;
  fromTokenAddress: `0x${string}`;
  fromAmount: bigint;
  spender: `0x${string}`;
  approvalReset?: boolean;
  approvalAmount: bigint;
  approvalLabel: string;
}): Promise<PreparedTransactionAction[]> {
  const publicClient = createPublicClientForRuntimeChain(params.chainId);
  const allowance = (await publicClient.readContract({
    address: params.fromTokenAddress,
    abi: parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]),
    functionName: "allowance",
    args: [params.account, params.spender],
  })) as bigint;

  if (params.fromAmount <= allowance) {
    return [];
  }

  const approvalActions: PreparedTransactionAction[] = [];
  if (params.approvalReset && allowance > 0n) {
    approvalActions.push(
      await createAllowanceAction({
        id: "bridge:approval-reset:0",
        chainId: params.chainId,
        tokenAddress: params.fromTokenAddress,
        spender: params.spender,
        amount: 0n,
        label: "Reset bridge spender approval",
      })
    );
  }

  approvalActions.push(
    await createAllowanceAction({
      id: "bridge:approval:0",
      chainId: params.chainId,
      tokenAddress: params.fromTokenAddress,
      spender: params.spender,
      amount: params.approvalAmount,
      label: params.approvalLabel,
    })
  );

  return approvalActions;
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

  if (Number(finalization.deadline) <= Math.floor(Date.now() / 1000)) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Permit2 authorization expired; prepare the bridge again",
    });
  }

  if (!finalAction.tx.data) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction is missing calldata for permit wrapping",
    });
  }

  const signature = assertHex(signatureResult.signature, "actionResults.signature");
  const calldataHash = keccak256(finalAction.tx.data);
  if (finalAction.tx.to.toLowerCase() !== finalization.diamondAddress.toLowerCase()) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.to does not match the signed Permit2 witness",
    });
  }
  if (calldataHash !== finalization.diamondCalldataHash) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.data does not match the signed Permit2 witness",
    });
  }

  return {
    ...finalAction,
    tx: {
      ...finalAction.tx,
      to: finalization.permit2Proxy,
      data: encodeFunctionData({
        abi: LIFI_PERMIT2_PROXY_ABI,
        functionName: "callDiamondWithPermit2Witness",
        args: [
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
        ],
      }),
    },
  };
}

export async function prepareCompatibilityBridgeIntent(
  input: PrepareBridgeIntentInput
): Promise<BridgeIntent> {
  try {
    const { quote, account, fromTokenAddress, fromAmount, finalAction } =
      await getLifiBridgePreparationContext(input);
    const actions: PreparedTransactionAction[] = [];
    const steps: BridgeTxStep[] = [];

    if (needsLifiBridgeApproval(quote, fromTokenAddress)) {
      const approvalActions = await getLifiApprovalActions({
        chainId: input.fromChainId,
        account,
        fromTokenAddress,
        fromAmount,
        spender: getDefaultLifiApprovalSpender(quote, finalAction),
        approvalReset: quote.estimate?.approvalReset,
        approvalAmount: input.approvalAmount
          ? parseBigIntString(input.approvalAmount, "approvalAmount")
          : maxUint256,
        approvalLabel: "Approve token for bridge",
      });
      actions.push(...approvalActions);
      steps.push(...createBridgeTxSteps("approval", approvalActions));
    }

    actions.push(finalAction);
    steps.push(createBridgeTxStep("bridge", finalAction));
    return createBridgeIntentPayload(input, quote, steps, actions);
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("BRIDGE_INTENT_ERROR", error);
  }
}

export async function prepareBridgeOperation(
  input: PrepareBridgeIntentInput
): Promise<PreparedOperation> {
  try {
    const { quote, summary, account, fromTokenAddress, fromAmount, finalAction, fromChain } =
      await getLifiBridgePreparationContext(input, { includeFromChain: true });
    const stages: PreparedAction[][] = [];
    const steps: BridgeTxStep[] = [];
    let finalization: LifiBridgeFinalization = { kind: "none" };
    const diamondAddress = fromChain?.diamondAddress
      ? assertAddress(fromChain.diamondAddress, "fromChain.diamondAddress")
      : undefined;
    const needsAllowanceCheck = needsLifiBridgeApproval(quote, fromTokenAddress);
    const permit2Eligible =
      needsAllowanceCheck &&
      !!fromChain?.permit2 &&
      !!fromChain?.permit2Proxy &&
      !!diamondAddress &&
      !quote.estimate?.skipPermit &&
      !!finalAction.tx.data &&
      finalAction.tx.to.toLowerCase() === diamondAddress.toLowerCase();

    if (needsAllowanceCheck) {
      const approvalActions = await getLifiApprovalActions({
        chainId: input.fromChainId,
        account,
        fromTokenAddress,
        fromAmount,
        spender: permit2Eligible
          ? assertAddress(fromChain?.permit2 ?? "", "fromChain.permit2")
          : getDefaultLifiApprovalSpender(quote, finalAction),
        approvalReset: quote.estimate?.approvalReset,
        approvalAmount: permit2Eligible ? maxUint256 : fromAmount,
        approvalLabel: permit2Eligible
          ? "Approve Permit2 (unlimited allowance)"
          : toBridgeStepLabel("approval"),
      });

      if (approvalActions.length > 0) {
        stages.push(approvalActions);
        steps.push(...createBridgeTxSteps("approval", approvalActions));
      }

      if (permit2Eligible && fromChain) {
        const permit2 = await getPermit2TypedData({
          account,
          tokenAddress: fromTokenAddress,
          amount: fromAmount,
          chain: fromChain,
          finalAction,
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
          permit2Proxy: assertAddress(fromChain.permit2Proxy ?? "", "fromChain.permit2Proxy"),
          account,
          witness: true,
          diamondAddress: permit2.diamondAddress,
          diamondCalldataHash: permit2.diamondCalldataHash,
        };
      }
    }

    steps.push(createBridgeTxStep("bridge", finalAction));
    const actions = [...stages.flat(), finalAction];
    const intent = createBridgeIntentPayload(input, quote, steps, actions);

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
      },
      { intent }
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("BRIDGE_INTENT_ERROR", error);
  }
}

export async function resumeLifiBridgeOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const bridgeState = parseInput(lifiBridgeResumeStateStateSchema, resumeState.state);
  const finalization =
    (bridgeState.finalization as LifiBridgeFinalization | undefined) ??
    ({ kind: "none" } satisfies LifiBridgeFinalization);

  for (const stage of bridgeState.stages) {
    const pendingStageActions = await getPendingPreparedActions(stage, actionResults);
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

  const rewrittenFinalAction = rewriteFinalBridgeAction(
    bridgeState.finalAction,
    finalization,
    actionResults
  );
  const finalTransaction = await assertConfirmedTransactionResult(
    actionResults,
    rewrittenFinalAction
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
