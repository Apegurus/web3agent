import { type Address, getAddress, hashTypedData } from "viem";

import { Web3AgentError } from "../../api/errors.js";
import type { createUniswapV4ReadClient } from "../../uniswap-v4/client.js";
import type { getUniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import type { UniswapV4RemoveOperation } from "../../uniswap-v4/planner-types.js";
import { getPositionManagerPermitData } from "../../uniswap-v4/sdk-adapter-api.js";
import { hashUniswapV4WritePlan } from "./write-plans.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";
import { uniswapV4PersistedWritePlanSchema } from "./write-schemas.js";

type NftPermitPlanInput = {
  readonly account: Address;
  readonly deployment: ReturnType<typeof getUniswapV4Deployment>;
  readonly operation: UniswapV4RemoveOperation;
  readonly persisted: UniswapV4PersistedWritePlan;
  readonly positionOwner: string;
  readonly readClient: ReturnType<typeof createUniswapV4ReadClient>;
};

export async function appendNftPermitAction(
  input: NftPermitPlanInput
): Promise<UniswapV4PersistedWritePlan> {
  if (input.positionOwner.toLowerCase() === input.account.toLowerCase()) return input.persisted;

  const sourceNft = await input.readClient.readPositionManagerPosition({
    blockNumber: BigInt(input.operation.sourceBlock.blockNumber),
    tokenId: BigInt(input.operation.tokenId),
  });
  const sourceNonce = await input.readClient.readPositionManagerNonce({
    blockNumber: BigInt(input.operation.sourceBlock.blockNumber),
    tokenId: BigInt(input.operation.tokenId),
  });
  const final = input.persisted.actions[0];
  if (final?.kind !== "positionManager") {
    throw new Web3AgentError({
      code: "UNISWAP_V4_EXTERNAL_PLAN_INVALID",
      message: "Delegated remove plans require one unsigned PositionManager transaction",
    });
  }
  const typedData = getPositionManagerPermitData({
    chainId: input.operation.chainId,
    deadline: BigInt(input.operation.deadline),
    nonce: sourceNonce.nonce,
    positionManager: input.deployment.positionManager,
    spender: input.account,
    tokenId: BigInt(input.operation.tokenId),
  });
  const nftAction = {
    domain: {
      ...typedData.domain,
      verifyingContract: getAddress(typedData.domain.verifyingContract),
    },
    expectedSigner: sourceNft.owner,
    finalActionId: `uniswap-v4:${input.operation.kind}:1`,
    kind: "nftPermitSignature" as const,
    message: { ...typedData.message, spender: getAddress(typedData.message.spender) },
    primaryType: typedData.primaryType,
    sourceNft: {
      nonce: sourceNonce.nonce.toString(),
      operator: sourceNft.operator,
      owner: sourceNft.owner,
      tokenId: input.operation.tokenId,
    },
    typedDataHash: hashTypedData({
      domain: {
        ...typedData.domain,
        verifyingContract: getAddress(typedData.domain.verifyingContract),
      },
      message: {
        deadline: BigInt(typedData.message.deadline),
        nonce: BigInt(typedData.message.nonce),
        spender: getAddress(typedData.message.spender),
        tokenId: BigInt(typedData.message.tokenId),
      },
      primaryType: typedData.primaryType,
      types: typedData.types,
    }),
    types: typedData.types,
    unsignedFinal: {
      data: final.data,
      dataHash: final.dataHash,
      to: final.to,
      value: final.value,
    },
  };
  const parsedCandidate = uniswapV4PersistedWritePlanSchema.parse({
    ...input.persisted,
    actions: [nftAction, final],
    planHash: input.persisted.planHash,
  });
  return uniswapV4PersistedWritePlanSchema.parse({
    ...parsedCandidate,
    planHash: hashUniswapV4WritePlan(parsedCandidate),
  });
}
