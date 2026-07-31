import { decodeFunctionData, recoverTypedDataAddress } from "viem";

import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import {
  buildPermit2PermitTransaction,
  permit2Abi,
  permit2Types,
} from "../../uniswap-v4/permit-actions.js";
import { invalid } from "./uniswap-v4-facts.js";

export async function verifyPermit2Submission(
  plan: UniswapV4PersistedWritePlan,
  input: `0x${string}`,
  id: string
): Promise<void> {
  const action = plan.actions.find((candidate) => candidate.kind === "permit2Signature");
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
