import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import type { PaymentRequired } from "@x402/fetch";
import { createPublicClient, createWalletClient, publicActions } from "viem";
import type { LocalAccount } from "viem/accounts";
import { getChainById } from "../chains/registry.js";
import { getTransportForChain } from "../config/wallet-factory.js";
import { getActiveAccount } from "../wallet/persistence.js";

export type X402ClientResult = {
  client: x402Client;
  fetchWithPayment: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export function createX402Client(chainId: number): X402ClientResult {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`[x402] Unsupported chain ID: ${chainId}`);
  }

  const transport = getTransportForChain(chainId);
  const publicClient = createPublicClient({ chain, transport });

  const account = getActiveAccount();
  const walletClient = createWalletClient({ account, chain, transport }).extend(publicActions);

  // biome-ignore lint/suspicious/noExplicitAny: walletClient.account is always a LocalAccount at runtime; viem's union type includes json-rpc accounts which lack address at top level
  const localAccount = (walletClient.account ?? account) as LocalAccount;
  const signer = toClientEvmSigner(localAccount, publicClient);
  const scheme = new ExactEvmScheme(signer);

  const client = new x402Client().register("eip155:*", scheme);
  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);

  return { client, fetchWithPayment };
}

export async function probePaymentRequirements(
  url: string,
  method = "GET",
  headers: Record<string, string> = {}
): Promise<PaymentRequired | null> {
  let response: Response;
  try {
    response = await globalThis.fetch(url, { method, headers });
  } catch (err: unknown) {
    process.stderr.write(`[x402] probePaymentRequirements fetch error for ${url}: ${err}\n`);
    return null;
  }

  if (response.status !== 402) {
    return null;
  }

  const headerValue = response.headers.get("PAYMENT-REQUIRED");
  if (headerValue) {
    try {
      return decodePaymentRequiredHeader(headerValue);
    } catch (err: unknown) {
      process.stderr.write(`[x402] Failed to decode PAYMENT-REQUIRED header: ${err}\n`);
    }
  }

  try {
    const text = await response.text();
    if (text) {
      return JSON.parse(text) as PaymentRequired;
    }
  } catch (err: unknown) {
    process.stderr.write(`[x402] Failed to parse 402 response body from ${url}: ${err}\n`);
  }

  return null;
}
