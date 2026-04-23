import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  english,
  generateMnemonic,
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { simulateTransaction } from "../../api/simulation.js";
import { getConfig } from "../../config/env.js";
import { getCachedBalanceUsd, refreshBalanceUsd } from "../../policy/balance-cache.js";
import { resolvePolicy } from "../../policy/config.js";
import { evaluatePolicy } from "../../policy/engine.js";
import { extractEstimatedUsd } from "../../policy/extract-usd.js";
import {
  commitReservation,
  recordSpend,
  releaseReservation,
  reserveSpend,
} from "../../policy/spend-tracker.js";
import {
  formatToolError,
  formatToolErrorFromUnknown,
  formatToolResponse,
} from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { confirmationQueue, registerExecutor } from "../../wallet/confirmation.js";
import {
  activateWallet,
  deactivateWallet,
  getActiveAccount,
  getWalletState,
} from "../../wallet/persistence.js";
import {
  transactionConfirmSchema,
  transactionDenySchema,
  transactionSimulateSchema,
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
  walletSetConfirmationSchema,
} from "./schemas.js";

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

export async function walletActivate(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const v = validateInput(walletActivateSchema, params);
    if (!v.success) return v.error;
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
      return formatToolResponse({ status: "pending_confirmation", id, summary });
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
    message: "Wallet deactivated. Reverted to read-only ephemeral wallet.",
  });
}

export async function walletDeactivate(): Promise<CallToolResult> {
  try {
    const state = getWalletState();
    if (state.mode === "read-only") {
      // Idempotent cleanup path — allowed from read-only mode so users can
      // ensure any persisted key file is removed even after prior deactivate.
      return walletDeactivateExecutor({});
    }
    return await executeWrite({
      toolName: "wallet_deactivate",
      description: "Deactivate wallet and delete persisted key file",
      params: {},
      executor: walletDeactivateExecutor,
      riskLevel: "destructive",
    });
  } catch (err: unknown) {
    return formatToolError(
      "WALLET_DEACTIVATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

// Three paths:
//  1. enabled=true  → set directly (toggling ON cannot weaken security)
//  2. enabled=false, already disabled → no-op response
//  3. enabled=false, currently enabled → queue via executeWrite (weakens security)
export async function walletSetConfirmation(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    const v = validateInput(walletSetConfirmationSchema, params);
    if (!v.success) return v.error;
    const { enabled } = v.data;

    if (enabled) {
      confirmationQueue.enabled = true;

      return formatToolResponse({
        confirmationRequired: true,
        message: "Write confirmation enabled. Transactions will require explicit confirmation.",
      });
    }

    if (!confirmationQueue.enabled) {
      return formatToolResponse({
        confirmationRequired: false,
        message: "Write confirmation already disabled. Transactions execute immediately.",
      });
    }

    return executeWrite({
      toolName: "wallet_set_confirmation",
      description: "Disable write confirmation — all future writes will execute immediately",
      params: { enabled: false } as unknown as Record<string, unknown>,
      executor: walletSetConfirmationExecutor,
      riskLevel: "destructive",
    });
  } catch (err: unknown) {
    return formatToolError(
      "SET_CONFIRMATION_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function transactionConfirm(params: Record<string, unknown>): Promise<CallToolResult> {
  let reservationId: number | null = null;
  let confirmedId: string | undefined;

  try {
    const walletState = getWalletState();
    const v = validateInput(transactionConfirmSchema, params);
    if (!v.success) return v.error;
    const { id } = v.data;

    const pendingOperation = confirmationQueue.list().find((operation) => operation.id === id);
    if (!pendingOperation) {
      return formatToolError("NOT_FOUND", `No pending operation with ID: ${id}`);
    }

    const elapsed = Date.now() - pendingOperation.createdAt.getTime();
    if (elapsed > pendingOperation.ttlMs) {
      confirmationQueue.pruneExpired();
      return formatToolError(
        "OPERATION_EXPIRED",
        `Operation ${id} was confirmed after TTL expiry and will not be executed.`
      );
    }

    const requiresWalletBalance = Boolean(pendingOperation.walletAddress);
    if (requiresWalletBalance && walletState.mode === "read-only") {
      return formatToolError(
        "WALLET_READ_ONLY",
        "transaction_confirm requires an active wallet. Activate a wallet first."
      );
    }

    if (
      pendingOperation.walletAddress &&
      walletState.address &&
      pendingOperation.walletAddress.toLowerCase() !== walletState.address.toLowerCase()
    ) {
      return formatToolError(
        "WALLET_MISMATCH",
        `Operation ${id} was queued for wallet ${pendingOperation.walletAddress} but active wallet is ${walletState.address}. Deny this operation and re-submit.`
      );
    }

    const opRiskLevel = pendingOperation.riskLevel ?? "financial";
    const opParams = pendingOperation.params;
    const rawEstimatedUsd = opRiskLevel === "safe" ? 0 : await extractEstimatedUsd(opParams);
    const spendWalletAddress = pendingOperation.walletAddress;

    if (opRiskLevel === "financial") {
      const policyChainId =
        typeof opParams.chainId === "number" ? (opParams.chainId as number) : walletState.chainId;
      let walletBalanceUsd: number | null = null;
      if (requiresWalletBalance && spendWalletAddress) {
        walletBalanceUsd = getCachedBalanceUsd(spendWalletAddress, policyChainId);
        if (walletBalanceUsd === null) {
          walletBalanceUsd = await refreshBalanceUsd(spendWalletAddress, policyChainId);
        }
      }

      if (rawEstimatedUsd !== null && rawEstimatedUsd > 0) {
        reservationId = reserveSpend(pendingOperation.type, rawEstimatedUsd, spendWalletAddress);
      }

      const config = getConfig();
      const policy = resolvePolicy(config);
      const policyDecision = evaluatePolicy(policy, {
        toolName: pendingOperation.type,
        riskLevel: opRiskLevel,
        estimatedUsd: rawEstimatedUsd,
        walletBalanceUsd,
        requiresWalletBalance,
      });

      if (policyDecision.action === "deny") {
        if (reservationId !== null) releaseReservation(reservationId);
        reservationId = null;
        return formatToolError("POLICY_DENIED", policyDecision.message, {
          reasonCode: policyDecision.reasonCode,
          currentSpend: policyDecision.currentSpend,
          note: "Policy re-evaluated at confirm time",
        });
      }
    }

    const result = confirmationQueue.confirm(id);
    if (!result) {
      if (reservationId !== null) releaseReservation(reservationId);
      reservationId = null;
      return formatToolError("NOT_FOUND", `No pending operation with ID: ${id}`);
    }
    confirmedId = id;

    if (result.stale) {
      confirmationQueue.expire(id);
      confirmedId = undefined;
      if (reservationId !== null) releaseReservation(reservationId);
      reservationId = null;
      return formatToolError(
        "OPERATION_EXPIRED",
        `Operation ${id} was confirmed after TTL expiry and will not be executed.`
      );
    }

    const execResult = await result.operation.executor(opParams);

    if (execResult.isError) {
      confirmationQueue.fail(id);
      confirmedId = undefined;
      if (reservationId !== null) releaseReservation(reservationId);
      reservationId = null;
      return execResult;
    }

    if (opRiskLevel === "financial") {
      if (reservationId !== null) {
        commitReservation(reservationId);
      } else if (rawEstimatedUsd !== null && rawEstimatedUsd > 0) {
        recordSpend(result.operation.type, rawEstimatedUsd, spendWalletAddress);
      }
    } else if (reservationId !== null) {
      releaseReservation(reservationId);
    }
    reservationId = null;

    confirmationQueue.complete(id);
    confirmedId = undefined;
    return execResult;
  } catch (err: unknown) {
    if (reservationId !== null) releaseReservation(reservationId);
    if (confirmedId) confirmationQueue.fail(confirmedId);
    return formatToolError("CONFIRM_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function transactionDeny(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const v = validateInput(transactionDenySchema, params);
    if (!v.success) return v.error;
    const { id } = v.data;

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

export async function transactionSimulate(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(transactionSimulateSchema, params);
  if (!v.success) return v.error;

  try {
    return formatToolResponse(await simulateTransaction(v.data));
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("SIMULATION_ERROR", error, "Failed to simulate transaction");
  }
}

async function walletSetConfirmationExecutor(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  confirmationQueue.enabled = (params as { enabled: boolean }).enabled;
  const enabled = confirmationQueue.enabled;
  return formatToolResponse({
    confirmationRequired: enabled,
    message: enabled
      ? "Write confirmation enabled."
      : "Write confirmation disabled. Transactions will execute immediately.",
  });
}

export function registerWalletExecutors(): void {
  // wallet_activate is NOT registered here — its executor captures secrets in a closure
  // and must not be restorable from persisted params. If a pending wallet_activate is
  // found on disk after restart, it's skipped (no registered executor).
  registerExecutor("wallet_deactivate", walletDeactivateExecutor);
  registerExecutor("wallet_set_confirmation", walletSetConfirmationExecutor);
}
