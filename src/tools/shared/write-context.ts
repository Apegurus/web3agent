import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Chain } from "viem";
import { createPublicClient } from "viem";
import { getChainById } from "../../chains/registry.js";
import { createWalletClientForChain, getTransportForChain } from "../../config/wallet-factory.js";
import { formatToolError } from "../../utils/errors.js";
import { getActiveAccount } from "../../wallet/persistence.js";

export type WriteContext = {
  chainId: number;
  chain: Chain;
  account: ReturnType<typeof getActiveAccount>;
  // biome-ignore lint/suspicious/noExplicitAny: viem WalletClient generics are complex; callers use specific methods
  walletClient: any;
  // biome-ignore lint/suspicious/noExplicitAny: viem PublicClient generics are complex; callers use specific methods
  publicClient: any;
};

export function buildWriteContext(chainId: number): WriteContext | CallToolResult {
  const chain = getChainById(chainId);
  if (!chain) {
    return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);
  }
  const account = getActiveAccount();
  const walletClient = createWalletClientForChain(account, chainId);
  const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
  return { chainId, chain, account, walletClient, publicClient };
}

export function isWriteContext(value: WriteContext | CallToolResult): value is WriteContext {
  return "chain" in value && "account" in value && !("content" in value);
}
