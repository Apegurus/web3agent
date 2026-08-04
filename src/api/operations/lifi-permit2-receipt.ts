import { decodeFunctionData, keccak256, recoverTypedDataAddress } from "viem";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertHex, parseBigIntString } from "../../operations/validation.js";
import { Web3AgentError } from "../errors.js";
import type { OperationActionResult, PreparedTransactionAction } from "../types.js";
import {
  LIFI_PERMIT2_PROXY_ABI,
  LIFI_PERMIT2_WITNESS_TYPES,
  type LifiBridgeFinalization,
  buildLifiReadClient,
  getPermit2Domain,
} from "./lifi-facts.js";
import { assertActionResultType } from "./shared.js";

export async function assertConfirmedLifiPermit2Transaction(
  actionResults: Record<string, OperationActionResult>,
  finalAction: PreparedTransactionAction,
  finalization: Extract<LifiBridgeFinalization, { readonly kind: "permit2" }>
): Promise<Extract<OperationActionResult, { readonly type: "transaction" }> | undefined> {
  const result = assertActionResultType(actionResults, finalAction.id, "transaction");
  if (!result) return undefined;
  const client = createPublicClientForRuntimeChain(finalAction.tx.chainId);
  const hash = assertHex(result.txHash, "actionResults.txHash");
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${finalAction.id} must reference a successful confirmed transaction`,
    });
  }
  const transaction = await client.getTransaction({ hash });
  if (
    transaction.to?.toLowerCase() !== finalization.permit2Proxy.toLowerCase() ||
    transaction.value !== BigInt(finalAction.tx.value ?? "0")
  ) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction target or value does not match the canonical action",
    });
  }
  const decoded = decodeFunctionData({
    abi: LIFI_PERMIT2_PROXY_ABI,
    data: assertHex(transaction.input, "submitted LI.FI Permit2 transaction input"),
  });
  if (decoded.functionName !== "callDiamondWithPermit2Witness") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI final transaction must call the canonical Permit2 witness entrypoint",
    });
  }
  const [diamondCalldata, owner, permitted, signature] = decoded.args;
  const canonicalAccount = finalAction.tx.from;
  if (
    !canonicalAccount ||
    !finalAction.tx.data ||
    diamondCalldata !== finalAction.tx.data ||
    keccak256(diamondCalldata) !== finalization.diamondCalldataHash ||
    finalization.account.toLowerCase() !== canonicalAccount.toLowerCase() ||
    owner.toLowerCase() !== finalization.account.toLowerCase() ||
    permitted[0][0].toLowerCase() !== finalization.tokenAddress.toLowerCase() ||
    permitted[0][1] !== parseBigIntString(finalization.amount, "finalization.amount") ||
    permitted[1] !== parseBigIntString(finalization.nonce, "finalization.nonce") ||
    permitted[2] !== parseBigIntString(finalization.deadline, "finalization.deadline")
  ) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction does not embed canonical authorization facts",
    });
  }
  const signer = await recoverTypedDataAddress({
    domain: getPermit2Domain(finalization.permit2, finalAction.tx.chainId),
    message: {
      permitted: { amount: permitted[0][1], token: permitted[0][0] },
      spender: finalization.permit2Proxy,
      nonce: permitted[1],
      deadline: permitted[2],
      witness: {
        diamondAddress: finalization.diamondAddress,
        diamondCalldataHash: finalization.diamondCalldataHash,
      },
    },
    primaryType: "PermitWitnessTransferFrom",
    signature,
    types: LIFI_PERMIT2_WITNESS_TYPES,
  });
  if (signer.toLowerCase() !== finalization.account.toLowerCase()) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction signer does not match operation account",
    });
  }
  const nextNonce = await buildLifiReadClient(
    finalization.account,
    finalAction.tx.chainId
  ).readContract({
    address: finalization.permit2Proxy,
    abi: LIFI_PERMIT2_PROXY_ABI,
    functionName: "nextNonce",
    args: [finalization.account],
  });
  if (nextNonce <= parseBigIntString(finalization.nonce, "finalization.nonce")) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction did not advance its canonical nonce",
    });
  }
  return result;
}
