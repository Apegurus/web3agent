import {
  type TransactionReceipt,
  decodeFunctionData,
  keccak256,
  recoverTypedDataAddress,
} from "viem";

import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertHex } from "../../operations/validation.js";
import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import {
  buildPermit2PermitTransaction,
  permit2Abi,
  permit2Types,
} from "../../uniswap-v4/permit-actions.js";
import { buildPositionManagerCalldataWithNftPermitSignature } from "../../uniswap-v4/sdk-adapter-api.js";
import type { OperationActionResult, PreparedTransactionAction } from "../types.js";
import { getConfirmedReceipt } from "./shared.js";
import { invalid } from "./uniswap-v4-facts.js";
import { assertPermit2PostTransactionState } from "./uniswap-v4-permit-poststate.js";
import { actionId } from "./uniswap-v4-resume-state.js";
import { nftPermitTypedData } from "./uniswap-v4-signature-validation.js";

const positionManagerSubmissionAbi = [
  {
    inputs: [{ name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

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
    return transactionAction(id, plan.operation.chainId, plan.deployment.permit2, "0");
  const nft = plan.actions.find(
    (action) => action.kind === "nftPermitSignature" && action.finalActionId === id
  );
  if (nft?.kind === "nftPermitSignature")
    return transactionAction(
      id,
      plan.operation.chainId,
      nft.unsignedFinal.to,
      nft.unsignedFinal.value
    );
  const action = plan.actions.find((_, index) => actionId(plan, index) === id);
  if (!action || action.kind === "permit2Signature" || action.kind === "nftPermitSignature")
    throw invalid("Uniswap v4 transaction action is unavailable");
  return transactionAction(id, plan.operation.chainId, action.to, action.value, action.data);
}

function transactionAction(
  id: string,
  chainId: number,
  to: `0x${string}`,
  value: string,
  data?: `0x${string}`
): PreparedTransactionAction {
  return {
    id,
    label: "Verify Uniswap v4 transaction",
    tx: { chainId, to, value, ...(data === undefined ? {} : { data }) },
    type: "transaction",
  };
}

async function verifyPermit2Submission(
  plan: UniswapV4PersistedWritePlan,
  input: `0x${string}`,
  id: string
): Promise<void> {
  const action = plan.actions.find((action) => action.kind === "permit2Signature");
  if (action?.kind !== "permit2Signature")
    throw invalid("Uniswap v4 Permit2 submission has no canonical authorization");
  const decoded = decodeFunctionData({ abi: permit2Abi, data: input });
  if (decoded.functionName !== "permit")
    throw invalid("Uniswap v4 Permit2 submission must call permit");
  const [owner, batch, signature] = decoded.args;
  if (
    owner.toLowerCase() !== plan.account.toLowerCase() ||
    batch.spender.toLowerCase() !== action.message.spender.toLowerCase() ||
    batch.sigDeadline !== BigInt(action.message.sigDeadline) ||
    !sameDetails(batch.details, action.message.details)
  )
    throw invalid("Uniswap v4 Permit2 submission does not embed the canonical permit batch");
  const signer = await recoverTypedDataAddress({
    domain: action.domain,
    message: permitMessage(action),
    primaryType: action.primaryType,
    signature,
    types: permit2Types,
  });
  if (signer.toLowerCase() !== plan.account.toLowerCase())
    throw invalid("Uniswap v4 Permit2 submission signer does not match operation account");
  const canonical = buildPermit2PermitTransaction({
    account: plan.account,
    permit: action.message,
    permit2: action.domain.verifyingContract,
    signature,
  });
  if (canonical.data !== input)
    throw invalid(
      `Action result ${id} transaction input does not match the canonical Permit2 encoding`
    );
}

async function verifyNftSubmission(
  action: Extract<
    UniswapV4PersistedWritePlan["actions"][number],
    { readonly kind: "nftPermitSignature" }
  >,
  input: `0x${string}`,
  id: string
): Promise<void> {
  const outer = decodeFunctionData({ abi: positionManagerSubmissionAbi, data: input });
  if (outer.functionName !== "multicall")
    throw invalid("Uniswap v4 NFT submission must use PositionManager multicall");
  const [calls] = outer.args;
  if (calls.length !== 2)
    throw invalid("Uniswap v4 NFT submission must contain exactly permit and final calls");
  const permit = decodeFunctionData({ abi: positionManagerSubmissionAbi, data: calls[0] });
  if (permit.functionName !== "permit")
    throw invalid("Uniswap v4 NFT submission first call must be permit");
  const [spender, tokenId, deadline, nonce, signature] = permit.args;
  if (
    spender.toLowerCase() !== action.message.spender.toLowerCase() ||
    tokenId !== BigInt(action.message.tokenId) ||
    deadline !== BigInt(action.message.deadline) ||
    nonce !== BigInt(action.message.nonce) ||
    calls[1] !== action.unsignedFinal.data
  )
    throw invalid("Uniswap v4 NFT submission does not embed the canonical permit and final call");
  const signer = await recoverTypedDataAddress({ ...nftPermitTypedData(action), signature });
  if (signer.toLowerCase() !== action.expectedSigner.toLowerCase())
    throw invalid("Uniswap v4 NFT submission signer does not match NFT owner");
  const canonical = buildPositionManagerCalldataWithNftPermitSignature({
    deadline,
    nonce,
    signature,
    spender,
    tokenId,
    transaction: { calldata: action.unsignedFinal.data, value: BigInt(action.unsignedFinal.value) },
  });
  if (canonical.calldata !== input)
    throw invalid(
      `Action result ${id} transaction input does not match canonical PositionManager encoding`
    );
}

function permitMessage(
  action: Extract<
    UniswapV4PersistedWritePlan["actions"][number],
    { readonly kind: "permit2Signature" }
  >
) {
  return {
    details: action.message.details.map((detail) => ({
      amount: BigInt(detail.amount),
      expiration: Number(detail.expiration),
      nonce: Number(detail.nonce),
      token: detail.token,
    })),
    sigDeadline: BigInt(action.message.sigDeadline),
    spender: action.message.spender,
  };
}

function sameDetails(
  actual: readonly {
    readonly amount: bigint;
    readonly expiration: number;
    readonly nonce: number;
    readonly token: `0x${string}`;
  }[],
  expected: readonly {
    readonly amount: string;
    readonly expiration: string;
    readonly nonce: string;
    readonly token: `0x${string}`;
  }[]
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (detail, index) =>
        detail.token.toLowerCase() === expected[index]?.token.toLowerCase() &&
        detail.amount === BigInt(expected[index].amount) &&
        detail.expiration === Number(expected[index].expiration) &&
        detail.nonce === Number(expected[index].nonce)
    )
  );
}

export async function assertPostTransactionState(
  plan: UniswapV4PersistedWritePlan,
  id: string
): Promise<void> {
  return assertPermit2PostTransactionState(plan, id);
}
