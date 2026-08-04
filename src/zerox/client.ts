import type { Hex } from "viem";
import { Web3AgentError } from "../api/errors.js";
import { resilientFetch } from "../utils/resilient-fetch.js";
import { type ZeroExAdapterDecision, getZeroExAdapterDecision } from "./capability.js";
import {
  type ZeroExQuoteRequest,
  zeroExErrorBodySchema,
  zeroExQuoteRequestSchema,
  zeroExQuoteResponseSchema,
} from "./schemas.js";

const ZEROEX_REQUEST_TIMEOUT_MS = 15_000;
const ZEROEX_API_URL = "https://api.0x.org/swap/allowance-holder/quote";
const NO_ROUTE_CODES = new Set(["NO_LIQUIDITY", "ROUTE_NOT_FOUND"]);
const PROVIDER_UNAVAILABLE_CODES = new Set(["SERVICE_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"]);
const TRANSACTION_REVERT_CODES = new Set(["SIMULATION_FAILED", "TRANSACTION_REVERTED"]);

export type ZeroExErrorClassification =
  | { readonly kind: "no-route"; readonly fallbackAllowed: true }
  | { readonly kind: "provider-unavailable"; readonly fallbackAllowed: true }
  | {
      readonly kind:
        | "authentication"
        | "rate-limit"
        | "validation"
        | "transaction-revert"
        | "unknown";
      readonly fallbackAllowed: false;
    };

export type ZeroExQuote = {
  readonly provider: "0x";
  readonly chainId: number;
  readonly adapterSource: "native";
  readonly capabilityDecisionId: ZeroExAdapterDecision["id"];
  readonly capabilityReason: Extract<ZeroExAdapterDecision, { adapterSource: "native" }>["reason"];
  readonly buyAmount: string;
  readonly sellAmount: string;
  readonly transaction: {
    readonly to: Hex;
    readonly data: Hex;
    readonly value: string;
  };
  readonly allowance?: {
    readonly target: Hex;
    readonly amount: string;
  };
  readonly priceImpactBps?: {
    readonly numerator: string;
    readonly denominator: string;
  };
};

function getNativeAdapterProvenance(): Pick<
  ZeroExQuote,
  "adapterSource" | "capabilityDecisionId" | "capabilityReason"
> {
  const decision = getZeroExAdapterDecision();
  if (decision.adapterSource !== "native") {
    throw new Web3AgentError({
      code: "ZEROEX_ADAPTER_PROVENANCE_MISMATCH",
      message: "Native 0x adapter is not authorized by the current capability decision",
    });
  }
  return {
    adapterSource: "native",
    capabilityDecisionId: decision.id,
    capabilityReason: decision.reason,
  };
}

type DecimalFraction = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

function parseDecimalFraction(value: string): DecimalFraction {
  const [whole, fractional = ""] = value.split(".");
  const denominator = 10n ** BigInt(fractional.length);
  return {
    numerator: BigInt(`${whole}${fractional}`),
    denominator,
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;
  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

function getPriceImpactBps(
  quotedPrice: string,
  referencePrice: string | undefined
): ZeroExQuote["priceImpactBps"] {
  if (!referencePrice) return undefined;
  const quoted = parseDecimalFraction(quotedPrice);
  const reference = parseDecimalFraction(referencePrice);
  const denominator = reference.numerator * quoted.denominator;
  if (denominator === 0n) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "referencePrice must be greater than zero",
    });
  }
  const numerator =
    (reference.numerator * quoted.denominator - quoted.numerator * reference.denominator) * 10_000n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  };
}

function toZeroExErrorCode(status: number, body: unknown): string {
  if (status === 401 || status === 403) return "ZEROEX_AUTHENTICATION";
  if (status === 429) return "ZEROEX_RATE_LIMIT";
  const parsed = zeroExErrorBodySchema.safeParse(body);
  const providerCode = parsed.success ? parsed.data.code : undefined;
  if (providerCode && NO_ROUTE_CODES.has(providerCode)) return "ZEROEX_NO_ROUTE";
  if (providerCode && PROVIDER_UNAVAILABLE_CODES.has(providerCode)) {
    return "ZEROEX_PROVIDER_UNAVAILABLE";
  }
  if (providerCode && TRANSACTION_REVERT_CODES.has(providerCode))
    return "ZEROEX_TRANSACTION_REVERT";
  if (status >= 400 && status < 500) return "ZEROEX_VALIDATION";
  return "ZEROEX_REQUEST_FAILED";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "ZEROEX_MALFORMED_RESPONSE",
      message: "0x returned an invalid JSON response",
      cause: error,
    });
  }
}

function createRequestUrl(input: ZeroExQuoteRequest): string {
  const url = new URL(ZEROEX_API_URL);
  url.searchParams.set("chainId", String(input.chainId));
  url.searchParams.set("sellToken", input.fromToken);
  url.searchParams.set("buyToken", input.toToken);
  url.searchParams.set("sellAmount", input.fromAmount);
  url.searchParams.set("taker", input.taker);
  url.searchParams.set("txOrigin", input.taker);
  if (input.slippageBps !== undefined)
    url.searchParams.set("slippageBps", String(input.slippageBps));
  return url.toString();
}

export function classifyZeroExError(error: unknown): ZeroExErrorClassification {
  if (!(error instanceof Web3AgentError)) return { kind: "unknown", fallbackAllowed: false };
  switch (error.code) {
    case "ZEROEX_NO_ROUTE":
      return { kind: "no-route", fallbackAllowed: true };
    case "ZEROEX_PROVIDER_UNAVAILABLE":
      return { kind: "provider-unavailable", fallbackAllowed: true };
    case "ZEROEX_AUTHENTICATION":
      return { kind: "authentication", fallbackAllowed: false };
    case "ZEROEX_RATE_LIMIT":
      return { kind: "rate-limit", fallbackAllowed: false };
    case "ZEROEX_VALIDATION":
    case "INVALID_PARAMS":
      return { kind: "validation", fallbackAllowed: false };
    case "ZEROEX_TRANSACTION_REVERT":
      return { kind: "transaction-revert", fallbackAllowed: false };
    default:
      return { kind: "unknown", fallbackAllowed: false };
  }
}

export async function getZeroExQuote(request: unknown): Promise<ZeroExQuote> {
  const input = zeroExQuoteRequestSchema.parse(request);
  const response = await resilientFetch(
    createRequestUrl(input),
    {
      method: "GET",
      headers: {
        "0x-api-key": input.apiKey,
        "0x-version": "v2",
      },
    },
    {
      label: "0x swap API v2",
      timeoutMs: ZEROEX_REQUEST_TIMEOUT_MS,
    }
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw new Web3AgentError({
      code: toZeroExErrorCode(response.status, body),
      message: "0x quote request failed",
    });
  }
  const parsed = zeroExQuoteResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Web3AgentError({
      code: "ZEROEX_MALFORMED_RESPONSE",
      message: "0x returned an invalid quote response",
    });
  }
  if (!parsed.data.liquidityAvailable) {
    throw new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "0x found no executable route" });
  }
  const allowance = parsed.data.issues.allowance;
  const priceImpactBps = getPriceImpactBps(parsed.data.price, input.referencePrice);
  return {
    provider: "0x",
    chainId: input.chainId,
    ...getNativeAdapterProvenance(),
    buyAmount: parsed.data.buyAmount,
    sellAmount: parsed.data.sellAmount,
    transaction: parsed.data.transaction,
    ...(allowance
      ? {
          allowance: {
            target: allowance.spender,
            amount: parsed.data.sellAmount,
          },
        }
      : {}),
    ...(priceImpactBps ? { priceImpactBps } : {}),
  };
}
