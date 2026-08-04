import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertHex } from "../../operations/validation.js";
import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import {
  assertUniswapV4ReconciliationComplete,
  reconcileUniswapV4ConfirmedReceipt,
} from "../../uniswap-v4/reconcile-confirmed.js";
import type { ResumeOperationCompletedResult } from "../types.js";
import { invalid } from "./uniswap-v4-facts.js";
import type { Progress } from "./uniswap-v4-resume-state.js";

export async function completed(
  plan: UniswapV4PersistedWritePlan,
  progress: Progress
): Promise<ResumeOperationCompletedResult> {
  const last = Object.values(progress.completed)
    .filter((stage) => stage.kind === "transaction")
    .at(-1);
  if (!last?.txHash) throw invalid("Uniswap v4 completion has no final transaction");
  const receipt = await createPublicClientForRuntimeChain(
    plan.operation.chainId
  ).getTransactionReceipt({
    hash: assertHex(last.txHash, "completed Uniswap v4 transaction hash"),
  });
  const reconciliation = await reconcileUniswapV4ConfirmedReceipt({ plan, receipt });
  assertUniswapV4ReconciliationComplete(reconciliation);
  return {
    completed: true,
    integration: "uniswap-v4",
    kind: plan.operation.kind,
    result: {
      expectedDeltas: plan.expectedDeltas,
      reconciliation,
      status: "completed",
      txHash: last.txHash,
    },
  };
}
