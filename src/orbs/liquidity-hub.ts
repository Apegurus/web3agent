// Polyfill localStorage for Node.js — the Orbs SDK reads optional debug
// overrides via localStorage.getItem() without a try-catch in its constructor.
if (!("localStorage" in globalThis)) {
  const noop = () => undefined;
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => null,
      setItem: noop,
      removeItem: noop,
      clear: noop,
      key: () => null,
      length: 0,
    },
    writable: true,
    configurable: true,
  });
}

import { constructSDK } from "@orbs-network/liquidity-hub-sdk";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { http, type Account, type Hex, createPublicClient, maxUint256 } from "viem";
import { getChainById } from "../chains/registry.js";
import { getConfig } from "../config/env.js";
import { createWalletClientForChain } from "../config/wallet-factory.js";

export type { Quote };

/**
 * Normalize EIP-712 typed data to match ethers.js `_TypedDataEncoder.getPayload()`.
 *
 * The Orbs solver verifies signatures against the ethers-normalized hash, which:
 * - Lowercases all `address` values (both in domain and message)
 * - Converts all `uint*`/`int*` values to decimal strings
 * - Converts `bool` values to proper booleans
 * - Recurses into nested structs and arrays
 *
 * Without this, viem's `signTypedData` produces a valid but DIFFERENT signature
 * hash, and the solver silently ignores the order.
 */
export function normalizeEip712ForSigning(
  domain: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>
): {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
} {
  function normalizeValue(fieldType: string, value: unknown): unknown {
    if (value == null) return value;

    // Array types — e.g. "DutchOutput[]"
    if (fieldType.endsWith("[]")) {
      const elementType = fieldType.slice(0, -2);
      if (!Array.isArray(value)) return value;
      return value.map((item) => normalizeValue(elementType, item));
    }

    // Nested struct — type name exists in types definition
    if (types[fieldType]) {
      return normalizeStruct(fieldType, value as Record<string, unknown>);
    }

    // address → lowercase
    if (fieldType === "address" && typeof value === "string") {
      return value.toLowerCase();
    }

    // uint* / int* → decimal string
    if (/^u?int\d*$/.test(fieldType)) {
      return BigInt(value as string | number | bigint).toString();
    }

    // bool → proper boolean
    if (fieldType === "bool") {
      return !!value;
    }

    return value;
  }

  function normalizeStruct(
    typeName: string,
    obj: Record<string, unknown>
  ): Record<string, unknown> {
    const fields = types[typeName];
    if (!fields) return obj;

    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (obj[field.name] !== undefined) {
        result[field.name] = normalizeValue(field.type, obj[field.name]);
      }
    }
    return result;
  }

  // Normalize domain: lowercase verifyingContract, stringify chainId
  const normalizedDomain: Record<string, unknown> = {};
  if (domain.name != null) normalizedDomain.name = domain.name;
  if (domain.version != null) normalizedDomain.version = domain.version;
  if (domain.chainId != null) normalizedDomain.chainId = Number(domain.chainId);
  if (domain.verifyingContract != null) {
    normalizedDomain.verifyingContract = (domain.verifyingContract as string).toLowerCase();
  }
  if (domain.salt != null) normalizedDomain.salt = domain.salt;

  return {
    domain: normalizedDomain,
    types,
    primaryType,
    message: normalizeStruct(primaryType, message),
  };
}

type LiquidityHubSDK = ReturnType<typeof constructSDK>;

const sdkCache = new Map<number, LiquidityHubSDK>();

const DEFAULT_PARTNERS: Record<number, string> = {
  56: "thena",
  137: "quickswap",
  8453: "intentx",
  59144: "lynex",
};

// Use ORBS_PARTNER env var to override per-chain defaults.
function getPartner(chainId: number): string {
  return getConfig().orbsPartner || DEFAULT_PARTNERS[chainId] || "widget";
}

export function getSdk(chainId: number): LiquidityHubSDK {
  let sdk = sdkCache.get(chainId);
  if (!sdk) {
    sdk = constructSDK({ partner: getPartner(chainId), chainId });
    sdkCache.set(chainId, sdk);
  }
  return sdk;
}

const API_URLS: Record<number, string> = {
  137: "https://polygon.hub.orbs.network",
  56: "https://bsc.hub.orbs.network",
  250: "https://ftm.hub.orbs.network",
  8453: "https://base.hub.orbs.network",
  59144: "https://linea.hub.orbs.network",
  81457: "https://blast.hub.orbs.network",
  1101: "https://zkevm.hub.orbs.network",
  146: "https://sonic.hub.orbs.network",
  42161: "https://arbi.hub.orbs.network",
};

function getApiUrl(chainId: number): string {
  return API_URLS[chainId] || "https://hub.orbs.network";
}

export interface SwapResult {
  sessionId: string;
  txHash?: string;
  status: "submitted" | "completed" | "failed";
  error?: string;
}

/**
 * Submit swap to Orbs API with proper error handling.
 * Unlike the SDK's fire-and-forget approach, this checks the response.
 */
export async function submitSwap(params: {
  chainId: number;
  quote: Quote;
  signature: string;
}): Promise<SwapResult> {
  const { chainId, quote, signature } = params;
  const apiUrl = getApiUrl(chainId);

  process.stderr.write(
    `[orbs] Submitting swap session=${quote.sessionId} ` +
      `${quote.inAmount} ${quote.inToken} → ${quote.outToken}\n`
  );

  const response = await fetch(`${apiUrl}/swap-async?chainId=${chainId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...quote,
      inToken: quote.inToken,
      outToken: quote.outToken,
      inAmount: quote.inAmount,
      user: quote.user,
      signature,
      sessionId: quote.sessionId,
    }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: Orbs API returns untyped JSON
  const result: any = await response.json();
  process.stderr.write(`[orbs] swap-async response: ${JSON.stringify(result)}\n`);

  if (result.error) {
    return { sessionId: quote.sessionId, status: "failed", error: result.error };
  }

  if (result.txHash) {
    return { sessionId: quote.sessionId, txHash: result.txHash, status: "completed" };
  }

  return { sessionId: quote.sessionId, status: "submitted" };
}

export async function pollSwapStatus(params: {
  chainId: number;
  sessionId: string;
  user: string;
  maxAttempts?: number;
}): Promise<SwapResult> {
  const { chainId, sessionId, user, maxAttempts = 15 } = params;
  const apiUrl = getApiUrl(chainId);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const response = await fetch(`${apiUrl}/swap/status/${sessionId}?chainId=${chainId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user }),
      });

      // biome-ignore lint/suspicious/noExplicitAny: Orbs API returns untyped JSON
      const status: any = await response.json();

      if (i % 5 === 0 || status.txHash || status.error) {
        process.stderr.write(`[orbs] Poll ${i + 1}/${maxAttempts}: ${JSON.stringify(status)}\n`);
      }

      if (status.error) {
        return { sessionId, status: "failed", error: status.error };
      }

      if (status.txHash) {
        process.stderr.write(`[orbs] Swap filled! txHash: ${status.txHash}\n`);
        return { sessionId, txHash: status.txHash, status: "completed" };
      }
    } catch (e: unknown) {
      process.stderr.write(`[orbs] Poll ${i + 1} error: ${e}\n`);
    }
  }

  return { sessionId, status: "submitted" };
}

export interface QuoteRequest {
  fromToken: string;
  toToken: string;
  inAmount: string;
  slippage?: number;
  account?: string;
}

export interface QuoteResult {
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  minAmountOut: string;
  exchange: string;
}

const QUOTE_ERRORS: Record<string, string> = {
  tns: "Token not supported or swap amount too small (minimum ~$6-10 depending on chain)",
  ldv: "Low dollar value — swap amount is below the minimum for this token pair",
  "no liquidity": "No liquidity available for this token pair on the Liquidity Hub",
  timeout: "Quote request timed out",
};

function formatQuoteError(code: string): string {
  return QUOTE_ERRORS[code] || `Liquidity Hub quote error: ${code}`;
}

export async function getQuote(chainId: number, request: QuoteRequest): Promise<QuoteResult> {
  const sdk = getSdk(chainId);
  const quote = await sdk.getQuote({
    fromToken: request.fromToken,
    toToken: request.toToken,
    inAmount: request.inAmount,
    slippage: request.slippage ?? 0.5,
    account: request.account,
  });

  if (quote.error) {
    throw new Error(formatQuoteError(quote.error));
  }

  return {
    inToken: quote.inToken,
    outToken: quote.outToken,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    minAmountOut: quote.minAmountOut,
    exchange: quote.exchange,
  };
}

const PERMIT2: Hex = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const NATIVE_TOKENS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000001010",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x000000000000000000000000000000000000dead",
]);

const WRAPPED_NATIVE: Record<number, Hex> = {
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  8453: "0x4200000000000000000000000000000000000006",
  59144: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
  81457: "0x4300000000000000000000000000000000000004",
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
};

const erc20Abi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

function isNativeToken(address: string): boolean {
  return NATIVE_TOKENS.has(address.toLowerCase());
}

export async function prepareSwap(params: {
  chainId: number;
  fromToken: string;
  inAmount: string;
  account: Account;
}): Promise<{ fromToken: Hex }> {
  const { chainId, inAmount, account } = params;
  const chain = getChainById(chainId);
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

  const publicClient = createPublicClient({ chain, transport: http() });
  let fromToken: Hex = params.fromToken as Hex;

  if (isNativeToken(params.fromToken)) {
    const wrapped = WRAPPED_NATIVE[chainId];
    if (!wrapped) throw new Error(`No wrapped native token for chain ${chainId}`);

    const walletClient = createWalletClientForChain(account, chainId);
    const hash = await walletClient.writeContract({
      address: wrapped,
      abi: erc20Abi,
      functionName: "deposit",
      value: BigInt(inAmount),
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    process.stderr.write(`[orbs] Wrapped ${inAmount} native → ${wrapped} (tx: ${hash})\n`);
    fromToken = wrapped;
  }

  const allowance = await publicClient.readContract({
    address: fromToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, PERMIT2],
  });

  if ((allowance as bigint) < BigInt(inAmount)) {
    const walletClient = createWalletClientForChain(account, chainId);
    const hash = await walletClient.writeContract({
      address: fromToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2, maxUint256],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    process.stderr.write(`[orbs] Approved ${fromToken} → Permit2 (tx: ${hash})\n`);
  }

  return { fromToken };
}
