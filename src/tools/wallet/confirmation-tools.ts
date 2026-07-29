import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { simulateTransaction } from "../../api/simulation.js";
import {
  formatToolError,
  formatToolErrorFromUnknown,
  formatToolResponse,
} from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import {
  transactionDenySchema,
  transactionSimulateSchema,
  walletSetConfirmationSchema,
} from "./schemas.js";

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
      params: { enabled: false },
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

export async function transactionDeny(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const v = validateInput(transactionDenySchema, params);
    if (!v.success) return v.error;
    const { id } = v.data;
    if (!confirmationQueue.deny(id)) {
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
      operations: operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        description: operation.description,
        createdAt: operation.createdAt.toISOString(),
        expiresIn: Math.max(0, operation.ttlMs - (Date.now() - operation.createdAt.getTime())),
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
    if (error instanceof Error) {
      return formatToolErrorFromUnknown(
        "SIMULATION_ERROR",
        error,
        "Failed to simulate transaction"
      );
    }
    return formatToolError("SIMULATION_ERROR", "Failed to simulate transaction");
  }
}

export async function walletSetConfirmationExecutor(
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
