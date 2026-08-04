import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  english,
  generateMnemonic,
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import {
  getAgentVisibleSecretsDisabledMessage,
  isAgentVisibleSecretsEnabled,
} from "../../wallet/agent-visible-secrets.js";
import { confirmationQueue, registerExecutor } from "../../wallet/confirmation.js";
import {
  activateWallet,
  deactivateWallet,
  deletePersistedWallet,
  getWalletState,
} from "../../wallet/persistence.js";
import { walletSetConfirmationExecutor } from "./confirmation-tools.js";
import {
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
} from "./schemas.js";

export {
  transactionDeny,
  transactionList,
  transactionSimulate,
  walletSetConfirmation,
} from "./confirmation-tools.js";
export { transactionConfirm } from "./transaction-confirm.js";
export { walletGetActive, walletInfo } from "./info.js";

function requireAgentVisibleSecrets(): CallToolResult | null {
  if (isAgentVisibleSecretsEnabled()) return null;
  return formatToolError("AGENT_VISIBLE_SECRETS_DISABLED", getAgentVisibleSecretsDisabledMessage());
}

export async function walletGenerate(): Promise<CallToolResult> {
  const gate = requireAgentVisibleSecrets();
  if (gate) return gate;

  try {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    return formatToolResponse({
      address: account.address,
      privateKey: key,
      warning: "Private key returned once. Never stored. Save it now.",
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_GENERATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletGenerateMnemonic(): Promise<CallToolResult> {
  const gate = requireAgentVisibleSecrets();
  if (gate) return gate;

  try {
    const mnemonic = generateMnemonic(english);
    const account = mnemonicToAccount(mnemonic);
    return formatToolResponse({
      mnemonic,
      firstAddress: account.address,
      derivationPath: "m/44'/60'/0'/0/0",
      warning: "Mnemonic returned once. Never stored. Save it now.",
    });
  } catch (err: unknown) {
    return formatToolError(
      "MNEMONIC_GENERATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletFromMnemonic(params: Record<string, unknown>): Promise<CallToolResult> {
  const gate = requireAgentVisibleSecrets();
  if (gate) return gate;

  try {
    const v = validateInput(walletFromMnemonicSchema, params);
    if (!v.success) return v.error;
    const { mnemonic, accountIndex = 0, addressIndex = 0 } = v.data;

    const account = mnemonicToAccount(mnemonic, {
      accountIndex,
      addressIndex,
    });

    return formatToolResponse({
      address: account.address,
      derivationPath: `m/44'/60'/${accountIndex}'/0/${addressIndex}`,
    });
  } catch (err: unknown) {
    return formatToolError(
      "MNEMONIC_RESOLVE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletDeriveAddresses(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const gate = requireAgentVisibleSecrets();
  if (gate) return gate;

  try {
    const v = validateInput(walletDeriveAddressesSchema, params);
    if (!v.success) return v.error;
    const { mnemonic, count = 5 } = v.data;

    const addresses = Array.from({ length: count }, (_, i) => {
      const account = mnemonicToAccount(mnemonic, { addressIndex: i });
      return {
        index: i,
        address: account.address,
        derivationPath: `m/44'/60'/0'/0/${i}`,
      };
    });

    return formatToolResponse(addresses);
  } catch (err: unknown) {
    return formatToolError("DERIVE_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function walletActivate(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const v = validateInput(walletActivateSchema, params);
    if (!v.success) return v.error;
    if (v.data.privateKey || v.data.mnemonic) {
      const gate = requireAgentVisibleSecrets();
      if (gate) return gate;
    }
    const description = v.data.mnemonic
      ? "Activate wallet from mnemonic phrase"
      : "Activate wallet from private key";

    // wallet_activate bypasses executeWrite() for two reasons:
    // 1. executeWrite rejects read-only mode, but wallet_activate is how you EXIT read-only.
    // 2. params contain secrets (privateKey/mnemonic) that must never be persisted to disk
    //    via the confirmation queue's pending-ops.json.
    // Instead, enqueue directly with scrubbed params and a closure that captures the real data.
    const activateData = { ...v.data };

    const { queued, id, summary } = confirmationQueue.enqueue(
      "wallet_activate",
      description,
      { source: activateData.mnemonic ? "mnemonic" : "private-key" },
      async () => {
        const state = await activateWallet(activateData);
        return formatToolResponse({
          address: state.address,
          chainId: state.chainId,
          mode: state.mode,
        });
      },
      undefined, // wallet_activate is the transition INTO a signing wallet — no pre-existing address requirement
      "destructive"
    );

    if (queued) {
      return formatToolResponse({
        status: "pending_confirmation",
        id,
        summary,
      });
    }

    const state = await activateWallet(activateData);
    return formatToolResponse({
      address: state.address,
      chainId: state.chainId,
      mode: state.mode,
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_ACTIVATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

async function walletDeactivateExecutor(_params: Record<string, unknown>): Promise<CallToolResult> {
  await deactivateWallet();
  const state = getWalletState();
  return formatToolResponse({
    mode: state.mode,
    message:
      "Wallet deactivated for the current runtime/session. Reverted to read-only ephemeral wallet.",
  });
}

export async function walletDeactivate(): Promise<CallToolResult> {
  try {
    return await walletDeactivateExecutor({});
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_DEACTIVATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

async function walletDeleteExecutor(_params: Record<string, unknown>): Promise<CallToolResult> {
  await deletePersistedWallet();
  const state = getWalletState();
  return formatToolResponse({
    mode: state.mode,
    message:
      "Permanently deleted persisted wallet material. Reverted to read-only ephemeral wallet.",
  });
}

export async function walletDelete(): Promise<CallToolResult> {
  try {
    const { queued, id, summary } = confirmationQueue.enqueue(
      "wallet_delete",
      "Permanently delete persisted wallet material and revert to read-only ephemeral mode",
      {},
      walletDeleteExecutor,
      undefined,
      "destructive"
    );

    if (queued) {
      return formatToolResponse({
        status: "pending_confirmation",
        id,
        summary,
      });
    }

    return await walletDeleteExecutor({});
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_DELETE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export function registerWalletExecutors(): void {
  // wallet_activate is NOT registered here — its executor captures secrets in a closure
  // and must not be restorable from persisted params. If a pending wallet_activate is
  // found on disk after restart, it's skipped (no registered executor).
  registerExecutor("wallet_deactivate", walletDeactivateExecutor);
  registerExecutor("wallet_set_confirmation", walletSetConfirmationExecutor);
}
