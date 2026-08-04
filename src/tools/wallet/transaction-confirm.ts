import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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
import { formatToolError } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import { getExecutionAuditMetadata } from "../../wallet/execution-metadata.js";
import { getWalletState } from "../../wallet/persistence.js";
import { transactionConfirmSchema } from "./schemas.js";

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
        typeof opParams.chainId === "number" ? opParams.chainId : walletState.chainId;
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

      const policyDecision = evaluatePolicy(resolvePolicy(getConfig()), {
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

    const result = await confirmationQueue.claimForExecution(id);
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

    const executionWalletState = getWalletState();
    if (
      pendingOperation.walletAddress &&
      (!executionWalletState.address ||
        pendingOperation.walletAddress.toLowerCase() !== executionWalletState.address.toLowerCase())
    ) {
      confirmedId = undefined;
      await confirmationQueue.releaseExecuting(id);
      if (reservationId !== null) releaseReservation(reservationId);
      reservationId = null;
      return formatToolError(
        "WALLET_MISMATCH",
        `Operation ${id} was queued for wallet ${pendingOperation.walletAddress} but active wallet is ${executionWalletState.address ?? "unavailable"}. Deny this operation and re-submit.`
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
      if (reservationId !== null) commitReservation(reservationId);
      else if (rawEstimatedUsd !== null && rawEstimatedUsd > 0) {
        recordSpend(result.operation.type, rawEstimatedUsd, spendWalletAddress);
      }
    } else if (reservationId !== null) {
      releaseReservation(reservationId);
    }
    reservationId = null;

    const auditMetadata = getExecutionAuditMetadata(execResult);
    if (auditMetadata) confirmationQueue.complete(id, auditMetadata);
    else confirmationQueue.complete(id);
    confirmedId = undefined;
    return execResult;
  } catch (err: unknown) {
    if (reservationId !== null) releaseReservation(reservationId);
    if (confirmedId) confirmationQueue.fail(confirmedId);
    return formatToolError("CONFIRM_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}
