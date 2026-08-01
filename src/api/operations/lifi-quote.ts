import type { LiFiStep } from "@lifi/sdk";
import {
  convertQuoteToRoute,
  getChains as getLifiChains,
  getQuote as getLifiQuote,
} from "@lifi/sdk";
import type { Hex } from "viem";
import { ensureLifiInitialized } from "../../lifi/config.js";
import { assertAddress, assertHex, parseBigIntString } from "../../operations/validation.js";
import { withTimeout } from "../../utils/timeout.js";
import { Web3AgentError } from "../errors.js";
import type {
  BridgeIntent,
  BridgeTxStep,
  PrepareBridgeIntentInput,
  PreparedAction,
  PreparedTransactionAction,
} from "../types.js";
import type {
  ExtendedChain,
  LifiBridgePreparationContext,
  LifiTransactionRequest,
} from "./lifi-facts.js";

const LIFI_CHAINS_CACHE_TTL_MS = 5 * 60 * 1000;
const LIFI_REQUEST_TIMEOUT_MS = 15_000;

let lifiChainsCache:
  | {
      promise: Promise<ExtendedChain[]>;
      expiresAt: number;
    }
  | undefined;

export function toBridgeStepLabel(type: BridgeTxStep["type"]): string {
  return type === "approval" ? "Approve bridge spender" : "Execute bridge";
}

export function createBridgeTxStep(
  type: BridgeTxStep["type"],
  action: PreparedTransactionAction
): BridgeTxStep {
  return {
    type,
    label: action.label,
    tx: action.tx,
  };
}

export function createBridgeTxSteps(
  type: BridgeTxStep["type"],
  actions: PreparedTransactionAction[]
): BridgeTxStep[] {
  return actions.map((action) => createBridgeTxStep(type, action));
}

function createPreparedTransactionActionFromRequest(
  id: string,
  label: string,
  request: LifiTransactionRequest,
  fallbackChainId: number,
  account: Hex
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
      from: account,
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
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      fromAddress: input.account,
      ...(input.slippagePct === undefined ? {} : { slippage: input.slippagePct / 100 }),
    }),
    LIFI_REQUEST_TIMEOUT_MS,
    "LI.FI quote"
  );
}

export async function getLifiBridgePreparationContext(
  input: PrepareBridgeIntentInput,
  options: { includeFromChain?: boolean } = {}
): Promise<LifiBridgePreparationContext> {
  const quote = await fetchLifiQuote(input);
  const finalAction = createPreparedTransactionActionFromRequest(
    "bridge:execute:0",
    toBridgeStepLabel("bridge"),
    getLifiBridgeTransactionRequest(quote),
    input.fromChainId,
    assertAddress(input.account, "account")
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

export function createBridgeIntentPayload(
  input: PrepareBridgeIntentInput,
  quote: LiFiStep,
  steps: BridgeTxStep[],
  actions: PreparedAction[]
): BridgeIntent {
  return {
    steps,
    actions,
    estimate: {
      fromToken: quote.action.fromToken?.address ?? input.fromToken,
      toToken: quote.action.toToken?.address ?? input.toToken,
      fromDecimals: quote.action.fromToken?.decimals,
      toDecimals: quote.action.toToken?.decimals,
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
