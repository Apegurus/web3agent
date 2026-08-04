import type { Hex, TransactionReceipt } from "viem";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { Web3AgentError } from "../errors.js";
import type { OperationActionResult, PreparedTransactionAction } from "../types.js";

function isMissingReceiptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("receipt") && message.includes("not found");
}

export async function getConfirmedReceipt(
  action: PreparedTransactionAction,
  result: Extract<OperationActionResult, { type: "transaction" }>
): Promise<TransactionReceipt> {
  const publicClient = createPublicClientForRuntimeChain(action.tx.chainId);

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: result.txHash as Hex,
    });
    if (receipt.status !== "success") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} must reference a successful confirmed transaction`,
      });
    }

    if (receipt.to && receipt.to.toLowerCase() !== action.tx.to.toLowerCase()) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} transaction target does not match the prepared action`,
      });
    }

    const transaction = await publicClient.getTransaction({ hash: result.txHash as Hex });
    const expectedFrom = action.tx.from?.toLowerCase();
    const expectedData = action.tx.data?.toLowerCase();
    const expectedValue = BigInt(action.tx.value ?? "0");
    if (
      (expectedFrom !== undefined && transaction.from.toLowerCase() !== expectedFrom) ||
      !transaction.to ||
      transaction.to.toLowerCase() !== action.tx.to.toLowerCase() ||
      (expectedData !== undefined && transaction.input.toLowerCase() !== expectedData) ||
      transaction.value !== expectedValue
    ) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} transaction does not match the prepared sender, target, calldata, or value`,
      });
    }

    return receipt;
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) throw error;
    if (isMissingReceiptError(error)) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} must reference a confirmed transaction receipt`,
        cause: error,
      });
    }
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Failed to verify transaction result for action ${action.id}`,
      cause: error,
    });
  }
}
