import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "../../config/env.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { getWalletBackend } from "../../wallet/backend-selector.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import { hasConfiguredOwsPassphrase } from "../../wallet/wallet-utils.js";

export async function walletGetActive(): Promise<CallToolResult> {
  try {
    const state = getWalletState();
    return formatToolResponse({
      address: state.address ?? getActiveAccount().address,
      chainId: getConfig().chainId,
      mode: state.mode,
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_STATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletInfo(): Promise<CallToolResult> {
  try {
    const backendInfo = getWalletBackend().info;
    const state = getWalletState();
    const isOws = backendInfo.type === "ows";
    let configPassphrase: string | undefined;
    try {
      configPassphrase = getConfig().owsPassphrase;
    } catch {
      configPassphrase = undefined;
    }

    return formatToolResponse({
      backend: backendInfo.type,
      backendReason: backendInfo.reason,
      vaultPath: isOws ? (backendInfo.vaultPath ?? null) : null,
      supportedChains: ["evm"],
      securityPosture: isOws ? "encrypted-at-rest" : "legacy-wallet-json",
      passphraseConfigured: hasConfiguredOwsPassphrase(configPassphrase),
      state: {
        mode: state.mode,
        address: state.address ?? null,
        chainId: state.chainId,
        accountIndex: state.accountIndex,
        addressIndex: state.addressIndex,
      },
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_INFO_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}
