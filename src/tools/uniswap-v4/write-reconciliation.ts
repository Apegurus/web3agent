import type { Hex } from "viem";

import { Web3AgentError } from "../../api/errors.js";
import {
  assertUniswapV4ReconciliationComplete,
  reconcileUniswapV4ConfirmedReceipt,
} from "../../uniswap-v4/reconcile-confirmed.js";
import { type buildWriteContext, isWriteContext } from "../shared/write-context.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";

export async function reconcileUniswapV4Write(input: {
  readonly context: ReturnType<typeof buildWriteContext> & object;
  readonly plan: UniswapV4PersistedWritePlan;
  readonly transactionHash: Hex;
}) {
  if (!isWriteContext(input.context)) throw new Error("Write context was not available");
  let receipt: unknown;
  try {
    receipt = await input.context.publicClient.getTransactionReceipt({
      hash: input.transactionHash,
    });
  } catch (error: unknown) {
    throw incomplete(input.transactionHash, error);
  }
  if (!isReconciliableReceipt(receipt)) throw incomplete(input.transactionHash);
  const reconciliation = await reconcileUniswapV4ConfirmedReceipt({ plan: input.plan, receipt });
  assertUniswapV4ReconciliationComplete(reconciliation);
  return reconciliation;
}

function incomplete(transactionHash: Hex, cause?: unknown): Web3AgentError {
  return new Web3AgentError({
    cause,
    code: "UNISWAP_V4_RECONCILIATION_INCOMPLETE",
    details: { transactionHash },
    message: "Uniswap v4 write cannot complete without a canonical receipt for reconciliation",
  });
}

function isReconciliableReceipt(
  value: unknown
): value is Parameters<typeof reconcileUniswapV4ConfirmedReceipt>[0]["receipt"] {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "blockHash" in value &&
    typeof value.blockHash === "string" &&
    "blockNumber" in value &&
    typeof value.blockNumber === "bigint" &&
    "logs" in value &&
    Array.isArray(value.logs) &&
    "status" in value &&
    (value.status === "success" || value.status === "reverted") &&
    "to" in value &&
    (typeof value.to === "string" || value.to === null) &&
    "transactionHash" in value &&
    typeof value.transactionHash === "string"
  );
}
