import type { Hex } from "viem";
import { decodeAbiParameters, hexToString } from "viem";
import { resilientFetch } from "../utils/resilient-fetch.js";

export type TokenMetadataSignals = {
  readonly decimals: number | null;
  readonly name?: string;
  readonly symbol?: string;
};

async function callContract(
  rpcUrl: string,
  tokenAddress: string,
  data: Hex
): Promise<string | null> {
  try {
    const response = await resilientFetch(
      rpcUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: tokenAddress, data }, "latest"],
        }),
      },
      { label: "rpc" }
    );
    if (!response.ok) return null;
    const result = (await response.json()) as { result?: unknown };
    return typeof result.result === "string" ? result.result : null;
  } catch (error: unknown) {
    process.stderr.write(`[tokens] RPC token metadata lookup failed: ${error}\n`);
    return null;
  }
}

function decodeDecimals(result: string | null): number | null {
  if (!result || result === "0x") return null;
  const decimals = Number.parseInt(result, 16);
  return decimals >= 0 && decimals <= 77 && Number.isFinite(decimals) ? decimals : null;
}

function decodeAbiEncodedString(result: string): string | null {
  try {
    const [decoded] = decodeAbiParameters([{ type: "string" }], result as Hex);
    const normalized = decoded.trim();
    return normalized.length > 0 ? normalized : null;
  } catch (_error: unknown) {
    return null;
  }
}

function decodeBytes32String(result: string): string | null {
  if (result.length !== 66) return null;
  try {
    const decoded = hexToString(result as Hex, { size: 32 })
      .replaceAll("\0", "")
      .trim();
    return decoded.length > 0 ? decoded : null;
  } catch (_error: unknown) {
    return null;
  }
}

function decodeTokenString(result: string | null): string | undefined {
  if (!result || result === "0x") return undefined;
  return decodeAbiEncodedString(result) ?? decodeBytes32String(result) ?? undefined;
}

export async function fetchTokenMetadata(
  tokenAddress: string,
  chain?: { readonly rpcUrls?: { readonly default?: { readonly http?: readonly string[] } } }
): Promise<TokenMetadataSignals> {
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) return { decimals: null };
  const [decimalsResult, symbolResult, nameResult] = await Promise.all([
    callContract(rpcUrl, tokenAddress, "0x313ce567"),
    callContract(rpcUrl, tokenAddress, "0x95d89b41"),
    callContract(rpcUrl, tokenAddress, "0x06fdde03"),
  ]);
  return {
    decimals: decodeDecimals(decimalsResult),
    symbol: decodeTokenString(symbolResult),
    name: decodeTokenString(nameResult),
  };
}
