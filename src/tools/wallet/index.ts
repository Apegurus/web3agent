import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  english,
  generateMnemonic,
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import {
  activateWallet,
  deactivateWallet,
  getActiveAccount,
  getWalletState,
} from "../../wallet/persistence.js";

export async function walletGenerate(): Promise<CallToolResult> {
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
  try {
    const mnemonic = params.mnemonic;
    if (typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "mnemonic is required");
    }

    const accountIndex = typeof params.accountIndex === "number" ? params.accountIndex : 0;
    const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : 0;

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
  try {
    const mnemonic = params.mnemonic;
    if (typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "mnemonic is required");
    }

    const count = typeof params.count === "number" ? params.count : 5;
    if (count < 1 || count > 20) {
      return formatToolError("INVALID_PARAMS", "count must be between 1 and 20");
    }

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

export async function walletGetActive(): Promise<CallToolResult> {
  try {
    const state = getWalletState();
    return formatToolResponse({
      address: state.address ?? getActiveAccount().address,
      chainId: state.chainId,
      mode: state.mode,
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_STATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletActivate(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const privateKey = typeof params.privateKey === "string" ? params.privateKey : undefined;
    const mnemonic = typeof params.mnemonic === "string" ? params.mnemonic : undefined;

    if (!privateKey && !mnemonic) {
      return formatToolError("INVALID_PARAMS", "Either privateKey or mnemonic must be provided");
    }

    const accountIndex = typeof params.accountIndex === "number" ? params.accountIndex : undefined;
    const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : undefined;

    const state = await activateWallet({
      privateKey,
      mnemonic,
      accountIndex,
      addressIndex,
    });

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

export async function walletDeactivate(): Promise<CallToolResult> {
  try {
    await deactivateWallet();
    const state = getWalletState();
    return formatToolResponse({
      mode: state.mode,
      message: "Wallet deactivated. Reverted to read-only ephemeral wallet.",
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_DEACTIVATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletSetConfirmation(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    const enabled = params.enabled;
    if (typeof enabled !== "boolean") {
      return formatToolError("INVALID_PARAMS", "enabled must be a boolean");
    }

    confirmationQueue.enabled = enabled;

    return formatToolResponse({
      confirmationRequired: confirmationQueue.enabled,
      message: enabled
        ? "Write confirmation enabled. Transactions will require explicit confirmation."
        : "Write confirmation disabled. Transactions will execute immediately.",
    });
  } catch (err: unknown) {
    return formatToolError(
      "SET_CONFIRMATION_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function transactionConfirm(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const id = params.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "id is required");
    }

    const result = confirmationQueue.confirm(id);
    if (!result) {
      return formatToolError("NOT_FOUND", `No pending operation with ID: ${id}`);
    }

    return formatToolResponse({
      confirmed: true,
      stale: result.stale,
      operation: {
        id: result.operation.id,
        type: result.operation.type,
        description: result.operation.description,
        params: result.operation.params,
      },
      warning: result.stale ? "Operation was confirmed after TTL expiry." : undefined,
    });
  } catch (err: unknown) {
    return formatToolError("CONFIRM_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function transactionDeny(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const id = params.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "id is required");
    }

    const removed = confirmationQueue.deny(id);
    if (!removed) {
      return formatToolError("NOT_FOUND", `No pending operation with ID: ${id}`);
    }

    return formatToolResponse({
      denied: true,
      id,
      message: "Operation denied and removed from queue.",
    });
  } catch (err: unknown) {
    return formatToolError("DENY_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function transactionList(): Promise<CallToolResult> {
  try {
    confirmationQueue.pruneExpired();
    const operations = confirmationQueue.list();

    return formatToolResponse({
      count: operations.length,
      operations: operations.map((op) => ({
        id: op.id,
        type: op.type,
        description: op.description,
        createdAt: op.createdAt.toISOString(),
        expiresIn: Math.max(0, op.ttlMs - (Date.now() - op.createdAt.getTime())),
      })),
    });
  } catch (err: unknown) {
    return formatToolError("LIST_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}
