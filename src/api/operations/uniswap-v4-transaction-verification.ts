import { type TransactionReceipt, keccak256 } from "viem";

import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertHex } from "../../operations/validation.js";
import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import type { OperationActionResult, PreparedTransactionAction } from "../types.js";
import { getConfirmedReceipt } from "./shared.js";
import { invalid } from "./uniswap-v4-facts.js";
import { verifyNftSubmission } from "./uniswap-v4-nft-verification.js";
import { assertPermit2PostTransactionState } from "./uniswap-v4-permit-poststate.js";
import { verifyPermit2Submission } from "./uniswap-v4-permit2-verification.js";
import { actionId } from "./uniswap-v4-resume-state.js";

export async function verifyTransaction(
  plan: UniswapV4PersistedWritePlan,
  id: string,
  result: Extract<OperationActionResult, { readonly type: "transaction" }>
): Promise<TransactionReceipt> {
  const expected = expectedAction(plan, id);
  const receipt = await getConfirmedReceipt(expected, result);
  const transaction = await createPublicClientForRuntimeChain(
    plan.operation.chainId
  ).getTransaction({
    hash: assertHex(result.txHash, "actionResults.txHash"),
  });
  if (
    transaction.from.toLowerCase() !== plan.account.toLowerCase() ||
    transaction.to?.toLowerCase() !== expected.tx.to.toLowerCase() ||
    transaction.value.toString() !== expected.tx.value
  )
    throw invalid(`Action result ${id} transaction facts do not match the canonical plan`);
  const input = assertHex(transaction.input, "submitted Uniswap v4 transaction input");
  if (id.endsWith(":submit")) {
    await verifyPermit2Submission(plan, input, id);
    return receipt;
  }
  const nftAction = plan.actions.find(
    (action) => action.kind === "nftPermitSignature" && action.finalActionId === id
  );
  if (nftAction?.kind === "nftPermitSignature") {
    await verifyNftSubmission(nftAction, input, id);
    return receipt;
  }
  const planned = plan.actions.find((_, index) => actionId(plan, index) === id);
  if (!planned || planned.kind === "permit2Signature" || planned.kind === "nftPermitSignature")
    throw invalid("Uniswap v4 transaction action is not canonical");
  if (input !== planned.data || keccak256(input) !== planned.dataHash)
    throw invalid(`Action result ${id} transaction input does not match the canonical plan`);
  return receipt;
}

function expectedAction(plan: UniswapV4PersistedWritePlan, id: string): PreparedTransactionAction {
  if (id.endsWith(":submit"))
    return transactionAction(
      id,
      plan.operation.chainId,
      plan.account,
      plan.deployment.permit2,
      "0"
    );
  const nft = plan.actions.find(
    (action) => action.kind === "nftPermitSignature" && action.finalActionId === id
  );
  if (nft?.kind === "nftPermitSignature")
    return transactionAction(
      id,
      plan.operation.chainId,
      plan.account,
      nft.unsignedFinal.to,
      nft.unsignedFinal.value
    );
  const action = plan.actions.find((_, index) => actionId(plan, index) === id);
  if (!action || action.kind === "permit2Signature" || action.kind === "nftPermitSignature")
    throw invalid("Uniswap v4 transaction action is unavailable");
  return transactionAction(
    id,
    plan.operation.chainId,
    plan.account,
    action.to,
    action.value,
    action.data
  );
}

function transactionAction(
  id: string,
  chainId: number,
  from: `0x${string}`,
  to: `0x${string}`,
  value: string,
  data?: `0x${string}`
): PreparedTransactionAction {
  return {
    id,
    label: "Verify Uniswap v4 transaction",
    tx: { chainId, from, to, value, ...(data === undefined ? {} : { data }) },
    type: "transaction",
  };
}

export async function assertPostTransactionState(
  plan: UniswapV4PersistedWritePlan,
  id: string
): Promise<void> {
  return assertPermit2PostTransactionState(plan, id);
}
