import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RiskLevel } from "../policy/types.js";
import type { OperationExecutor } from "../types/wallet.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { getWalletState } from "../wallet/persistence.js";
import { formatToolError, formatToolResponse } from "./errors.js";

export interface ExecuteWriteOptions {
  toolName: string;
  description: string;
  params: Record<string, unknown>;
  executor: OperationExecutor;
  riskLevel?: RiskLevel;
}

export async function executeWrite(options: ExecuteWriteOptions): Promise<CallToolResult> {
  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError(
      "WALLET_READ_ONLY",
      `${options.toolName} requires an active wallet. Use wallet_generate or import a key first.`
    );
  }

  const { queued, id, summary } = confirmationQueue.enqueue(
    options.toolName,
    options.description,
    options.params,
    options.executor,
    walletState.address,
    options.riskLevel
  );

  if (queued) {
    return formatToolResponse({ status: "pending_confirmation", id, summary });
  }

  return options.executor(options.params);
}
