import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";

export async function serverStatus(): Promise<CallToolResult> {
  try {
    const wallet = getWalletState();
    return formatToolResponse({
      walletMode: wallet.mode,
      activeChainId: wallet.chainId,
      confirmWrites: confirmationQueue.enabled,
      backends: {
        blockscout: "not_initialized",
        evm: "not_initialized",
        goat: "not_initialized",
      },
      toolCount: 0,
    });
  } catch (err: unknown) {
    return formatToolError("STATUS_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function listSupportedChains(): Promise<CallToolResult> {
  try {
    const { getAllChains } = await import("../../chains/registry.js");
    const chains = getAllChains();
    return formatToolResponse(
      chains.map((c) => ({
        id: c.id,
        name: c.name,
        nativeCurrency: c.nativeCurrency,
      }))
    );
  } catch {
    return formatToolError("CHAINS_UNAVAILABLE", "Chain registry not yet initialized");
  }
}
