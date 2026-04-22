import { estimateTokenUsd } from "../tokens/pricing.js";
import { lookupTokenByAddress } from "../tokens/registry.js";

const USD_FIELD_NAMES = ["amountUsd", "amount_usd", "estimatedUsd"];
const USD_QUOTES = new Set([
  "USD",
  "USDT",
  "USDC",
  "USDC.E",
  "USDBC",
  "BUSD",
  "DAI",
  "USDB",
  "FDUSD",
  "TUSD",
  "USDP",
]);

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractQuoteAsset(symbol: string): string | null {
  const [pair] = symbol.split(":");
  const parts = pair.split("/");
  if (parts.length !== 2) return null;
  return parts[1].toUpperCase();
}

function extractCcxtOrderUsd(args: Record<string, unknown>): number | null {
  const method = args.method;
  const methodArgs = args.args;
  if (!Array.isArray(methodArgs)) return null;

  if (method === "createOrder") {
    const symbol = methodArgs[0];
    const amount = parsePositiveNumber(methodArgs[3]);
    const price = parsePositiveNumber(methodArgs[4]);
    if (typeof symbol !== "string" || amount === null || price === null) return 0;

    const quote = extractQuoteAsset(symbol);
    if (quote === null || !USD_QUOTES.has(quote)) return 0;
    return amount * price;
  }

  if (method === "editOrder") {
    const symbol = methodArgs[1];
    const amount = parsePositiveNumber(methodArgs[4]);
    const price = parsePositiveNumber(methodArgs[5]);
    if (typeof symbol !== "string" || amount === null || price === null) return 0;

    const quote = extractQuoteAsset(symbol);
    if (quote === null || !USD_QUOTES.has(quote)) return 0;
    return amount * price;
  }

  return null;
}

/**
 * Returns the estimated USD value for a financial tool call.
 * - positive number: estimation succeeded
 * - 0: estimation was attempted (token fields present) but failed (price feed down, unknown token)
 * - null: tool args have no estimable token fields (gas-only write, cancellation, approval)
 */
export async function extractEstimatedUsd(args: Record<string, unknown>): Promise<number | null> {
  // 1. Check explicit USD fields
  for (const key of USD_FIELD_NAMES) {
    const val = args[key];
    if (typeof val === "number" && val > 0) return val;
    if (typeof val === "string") {
      const parsed = Number(val);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // 2. Try CCXT order args for create/edit order flows
  const ccxtOrderUsd = extractCcxtOrderUsd(args);
  if (ccxtOrderUsd !== null) {
    return ccxtOrderUsd;
  }

  // 3. Try fromToken + fromAmount + chainId price lookup
  const fromToken = args.fromToken;
  const fromAmount = args.fromAmount;
  const chainId = args.chainId;
  if (
    typeof fromToken === "string" &&
    typeof fromAmount === "string" &&
    typeof chainId === "number"
  ) {
    const entry = lookupTokenByAddress(fromToken, chainId);
    const decimals =
      entry?.decimals ?? (typeof args.fromDecimals === "number" ? args.fromDecimals : null);
    if (decimals !== null) {
      const usd = await estimateTokenUsd(fromToken, chainId, fromAmount, decimals);
      return usd ?? 0;
    }
    return 0;
  }

  // 4. Check inside resumeState.state for operation_resume calls
  const resumeState = args.resumeState;
  if (
    resumeState &&
    typeof resumeState === "object" &&
    "state" in resumeState &&
    resumeState.state &&
    typeof resumeState.state === "object"
  ) {
    const state = resumeState.state as Record<string, unknown>;
    const nestedFromToken = state.fromToken;
    const nestedFromAmount = state.fromAmount;
    const nestedChainId = state.chainId;
    if (
      typeof nestedFromToken === "string" &&
      typeof nestedFromAmount === "string" &&
      typeof nestedChainId === "number"
    ) {
      const entry = lookupTokenByAddress(nestedFromToken, nestedChainId);
      const decimals =
        entry?.decimals ?? (typeof state.fromDecimals === "number" ? state.fromDecimals : null);
      if (decimals !== null) {
        const usd = await estimateTokenUsd(
          nestedFromToken,
          nestedChainId,
          nestedFromAmount,
          decimals
        );
        return usd ?? 0;
      }
    }
    // resumeState has nested token fields but estimation failed
    return 0;
  }

  // No token amount fields found — tool is gas-only (cancel, approve, generic write)
  return null;
}
