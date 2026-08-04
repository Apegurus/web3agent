import { type Address, type Hex, hashTypedData, keccak256, recoverTypedDataAddress } from "viem";

import { assertHex } from "../../operations/validation.js";
import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import { createUniswapV4ReadClient } from "../../uniswap-v4/client.js";
import { buildPermit2PermitTransaction, permit2Types } from "../../uniswap-v4/permit-actions.js";
import { buildPositionManagerCalldataWithNftPermitSignature } from "../../uniswap-v4/sdk-adapter-api.js";
import type { TypedDataPayload } from "../types.js";
import { invalid } from "./uniswap-v4-facts.js";
import type { PlanAction } from "./uniswap-v4-resume-state.js";

export type AcceptedSignature = {
  readonly signer: Address;
  readonly transaction: {
    readonly data: Hex;
    readonly dataHash: Hex;
    readonly to: Address;
    readonly value: string;
  };
  readonly typedDataHash: Hex;
};

export async function acceptSignature(
  plan: UniswapV4PersistedWritePlan,
  action: Extract<PlanAction, { readonly kind: "permit2Signature" | "nftPermitSignature" }>,
  signature: Hex
): Promise<AcceptedSignature> {
  if (action.kind === "permit2Signature") {
    assertTypedDataHash(action);
    await assertCurrentPermit2State(plan, action);
    const signer = await recoverTypedDataAddress({
      domain: action.domain,
      message: permitMessage(action),
      primaryType: action.primaryType,
      signature,
      types: permit2Types,
    });
    if (signer.toLowerCase() !== plan.account.toLowerCase())
      throw invalid("Uniswap v4 Permit2 signer does not match operation account");
    const transaction = buildPermit2PermitTransaction({
      account: plan.account,
      permit: action.message,
      permit2: action.domain.verifyingContract,
      signature,
    });
    return {
      signer,
      transaction: {
        data: transaction.data,
        dataHash: keccak256(transaction.data),
        to: transaction.to,
        value: transaction.value,
      },
      typedDataHash: assertHex(action.typedDataHash, "Permit2 typed-data hash"),
    };
  }
  assertTypedDataHash(action);
  await assertCurrentNftPermitState(plan, action);
  const signer = await recoverTypedDataAddress({
    domain: action.domain,
    message: nftPermitMessage(action),
    primaryType: action.primaryType,
    signature,
    types: action.types,
  });
  if (signer.toLowerCase() !== action.expectedSigner.toLowerCase())
    throw invalid("Uniswap v4 NFT permit signer does not match NFT owner");
  const transaction = buildPositionManagerCalldataWithNftPermitSignature({
    deadline: BigInt(action.message.deadline),
    nonce: BigInt(action.message.nonce),
    signature,
    spender: action.message.spender,
    tokenId: BigInt(action.message.tokenId),
    transaction: { calldata: action.unsignedFinal.data, value: BigInt(action.unsignedFinal.value) },
  });
  const data = assertHex(transaction.calldata, "derived NFT permit calldata");
  return {
    signer,
    transaction: {
      data,
      dataHash: keccak256(data),
      to: action.unsignedFinal.to,
      value: transaction.value.toString(),
    },
    typedDataHash: assertHex(action.typedDataHash, "NFT typed-data hash"),
  };
}

function assertTypedDataHash(
  action: Extract<PlanAction, { readonly kind: "permit2Signature" | "nftPermitSignature" }>
): void {
  const typedDataHash =
    action.kind === "permit2Signature"
      ? hashTypedData({
          domain: action.domain,
          message: permitMessage(action),
          primaryType: action.primaryType,
          types: permit2Types,
        })
      : hashTypedData({
          domain: action.domain,
          message: nftPermitMessage(action),
          primaryType: action.primaryType,
          types: action.types,
        });
  if (typedDataHash !== assertHex(action.typedDataHash, "typed-data hash"))
    throw invalid("Uniswap v4 typed-data payload hash mismatch");
}

export async function assertCurrentPermit2State(
  plan: UniswapV4PersistedWritePlan,
  action: Extract<PlanAction, { readonly kind: "permit2Signature" }>
): Promise<void> {
  const client = createUniswapV4ReadClient({
    chainId: plan.operation.chainId,
    deployment: plan.deployment,
  });
  for (const detail of action.message.details) {
    const current = await client.readPermit2Allowance({
      owner: plan.account,
      spender: action.message.spender,
      token: detail.token,
    });
    if (current.nonce !== BigInt(detail.nonce) || current.expiration !== BigInt(detail.expiration))
      throw invalid("Uniswap v4 Permit2 nonce or expiration is stale");
  }
}

async function assertCurrentNftPermitState(
  plan: UniswapV4PersistedWritePlan,
  action: Extract<PlanAction, { readonly kind: "nftPermitSignature" }>
): Promise<void> {
  const client = createUniswapV4ReadClient({
    chainId: plan.operation.chainId,
    deployment: plan.deployment,
  });
  const tokenId = BigInt(action.sourceNft.tokenId);
  const [current, nonce] = await Promise.all([
    client.readPositionManagerPosition({ tokenId }),
    client.readPositionManagerNonce({ tokenId }),
  ]);
  if (
    current.owner.toLowerCase() !== action.sourceNft.owner.toLowerCase() ||
    current.operator.toLowerCase() !== action.sourceNft.operator.toLowerCase() ||
    nonce.nonce !== BigInt(action.sourceNft.nonce)
  )
    throw invalid("Uniswap v4 NFT permit owner, operator, or nonce is stale");
}

export function permitTypedData(
  action: Extract<PlanAction, { readonly kind: "permit2Signature" }>
): TypedDataPayload {
  return {
    domain: action.domain,
    message: action.message,
    primaryType: action.primaryType,
    types: {
      PermitBatch: [...permit2Types.PermitBatch],
      PermitDetails: [...permit2Types.PermitDetails],
    },
  };
}

export function nftPermitTypedData(
  action: Extract<PlanAction, { readonly kind: "nftPermitSignature" }>
): TypedDataPayload {
  return {
    domain: action.domain,
    message: action.message,
    primaryType: action.primaryType,
    types: action.types,
  };
}

function permitMessage(action: Extract<PlanAction, { readonly kind: "permit2Signature" }>) {
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

function nftPermitMessage(action: Extract<PlanAction, { readonly kind: "nftPermitSignature" }>) {
  return {
    deadline: BigInt(action.message.deadline),
    nonce: BigInt(action.message.nonce),
    spender: action.message.spender,
    tokenId: BigInt(action.message.tokenId),
  };
}
