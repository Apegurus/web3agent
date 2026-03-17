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
import { getCachedBalanceUsd } from "../../policy/balance-cache.js";
import { resolvePolicy } from "../../policy/config.js";
import { evaluatePolicy } from "../../policy/engine.js";
import { extractEstimatedUsd } from "../../policy/extract-usd.js";
import { recordSpend } from "../../policy/spend-tracker.js";
import {
  formatToolError,
  formatToolErrorFromUnknown,
  formatToolResponse,
} from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
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
    const { privateKey, mnemonic, accountIndex, addressIndex } = v.data;

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
    const v = validateInput(walletSetConfirmationSchema, params);
    if (!v.success) return v.error;
    const { enabled } = v.data;

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
    const walletState = getWalletState();
    if (walletState.mode === "read-only") {
      return formatToolError(
        "WALLET_READ_ONLY",
        "transaction_confirm requires an active wallet. Activate a wallet first."
      );
    }

    const v = validateInput(transactionConfirmSchema, params);
    if (!v.success) return v.error;
    const { id } = v.data;

    const result = confirmationQueue.confirm(id);
    if (!result) {
      return formatToolError("NOT_FOUND", `No pending operation with ID: ${id}`);
    }

    if (result.stale) {
      confirmationQueue.complete(id);
      return formatToolError(
        "OPERATION_EXPIRED",
        `Operation ${id} was confirmed after TTL expiry and will not be executed.`
      );
    }

    if (
      result.operation.walletAddress &&
      walletState.address &&
      result.operation.walletAddress.toLowerCase() !== walletState.address.toLowerCase()
    ) {
      return formatToolError(
        "WALLET_MISMATCH",
        `Operation ${id} was queued for wallet ${result.operation.walletAddress} but active wallet is ${walletState.address}. Deny this operation and re-submit.`
      );
    }

    const opRiskLevel = result.operation.riskLevel ?? "financial";
    const opParams = result.operation.params;
    const rawEstimatedUsd = opRiskLevel === "safe" ? 0 : await extractEstimatedUsd(opParams);
    const estimatedUsd = rawEstimatedUsd ?? 0;

    if (opRiskLevel === "financial") {
      const config = getConfig();
      const policy = resolvePolicy(config);
      const policyDecision = evaluatePolicy(policy, {
        toolName: result.operation.type,
        riskLevel: opRiskLevel,
        estimatedUsd,
        walletBalanceUsd: getCachedBalanceUsd(),
      });

      if (policyDecision.action === "deny") {
        return formatToolError("POLICY_DENIED", policyDecision.message, {
          reasonCode: policyDecision.reasonCode,
          currentSpend: policyDecision.currentSpend,
          note: "Policy re-evaluated at confirm time",
        });
      }
    }

    const execResult = await result.operation.executor(opParams);

    if (opRiskLevel === "financial" && !execResult.isError) {
      recordSpend(result.operation.type, estimatedUsd, walletState.address);
    }

    confirmationQueue.complete(id);
    return execResult;
  } catch (err: unknown) {
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
