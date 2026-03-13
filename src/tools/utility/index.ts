import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { RESTRICTED_PLUGIN_CHAINS } from "../../goat/dispatch.js";
import { LIQUIDITY_HUB_CHAINS } from "../../orbs/chains.js";
import type { HealthStatus } from "../../types/health.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";

let _health: HealthStatus | null = null;
let _totalToolCount = 0;

export function setHealthStatus(health: HealthStatus, totalToolCount: number): void {
  _health = health;
  _totalToolCount = totalToolCount;
}

export async function serverStatus(): Promise<CallToolResult> {
  try {
    const wallet = getWalletState();
    const backends = _health
      ? {
          blockscout: _health.blockscout.status,
          etherscan: _health.etherscan.status,
          evm: _health.evm.status,
          goat: _health.goat.status,
          lifi: _health.lifi.status,
          orbs: _health.orbs.status,
        }
      : {
          blockscout: "not_initialized",
          etherscan: "not_initialized",
          evm: "not_initialized",
          goat: "not_initialized",
          lifi: "not_initialized",
          orbs: "not_initialized",
        };
    return formatToolResponse({
      walletMode: wallet.mode,
      activeChainId: getConfig().chainId,
      confirmWrites: confirmationQueue.enabled,
      backends,
      toolCount: _totalToolCount,
    });
  } catch (err: unknown) {
    return formatToolError("STATUS_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

const INTEGRATION_CHAINS = new Set([
  ...LIQUIDITY_HUB_CHAINS,
  ...Object.values(RESTRICTED_PLUGIN_CHAINS).flat(),
]);

export async function listSupportedChains(): Promise<CallToolResult> {
  try {
    const chains = [...INTEGRATION_CHAINS]
      .map((id) => {
        const chain = getChainById(id);
        if (!chain) return null;
        return { id: chain.id, name: chain.name, nativeCurrency: chain.nativeCurrency };
      })
      .filter((c) => c !== null);

    return formatToolResponse({
      note: "Any EVM chain supported by viem works for basic operations (ERC-20, ERC-721, ENS). Chains listed below have enhanced integration (DEX swaps, bridging, Orbs).",
      chains,
    });
  } catch (e: unknown) {
    return formatToolError("CHAINS_UNAVAILABLE", String(e));
  }
}
