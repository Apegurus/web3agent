import type { Address } from "viem";

import { Web3AgentError } from "../../api/errors.js";
import { uniswapV4DeploymentSchema } from "../../api/schemas/uniswap-v4/primitives.js";
import type { UniswapV4LifecycleOperation } from "../../api/types.js";
import { ERC20_BALANCE_ABI, getPublicClientCached } from "../../evm/services.js";
import { createUniswapV4ReadClient } from "../../uniswap-v4/client.js";
import { ROBINHOOD_UNISWAP_V4_PROVENANCE } from "../../uniswap-v4/deployment-provenance.js";
import { getUniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import { planUniswapV4Remove } from "../../uniswap-v4/planner-remove.js";
import type {
  UniswapV4AddOperation,
  UniswapV4RemoveOperation,
  UniswapV4TokenAllowance,
} from "../../uniswap-v4/planner-types.js";
import { planUniswapV4Add } from "../../uniswap-v4/planner.js";
import { createUniswapV4StateReader } from "../../uniswap-v4/state.js";
import { getActiveAccount } from "../../wallet/persistence.js";
import { appendNftPermitAction } from "./write-planner-nft-permit.js";
import { createPersistedUniswapV4WritePlan } from "./write-plans.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";

export async function prepareUniswapV4WritePlan(
  operation: UniswapV4LifecycleOperation
): Promise<UniswapV4PersistedWritePlan> {
  const account = getActiveAccount();
  if (account.address.toLowerCase() !== operation.account.toLowerCase()) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_PLANNER_ACCOUNT_MISMATCH",
      message: "Lifecycle operation account must match the active server wallet",
    });
  }
  return prepareWritePlan(operation, false);
}

export async function prepareExternalUniswapV4WritePlan(
  operation: UniswapV4LifecycleOperation
): Promise<UniswapV4PersistedWritePlan> {
  return prepareWritePlan(operation, true);
}

async function prepareWritePlan(
  operation: UniswapV4LifecycleOperation,
  allowOwnerPermit: boolean
): Promise<UniswapV4PersistedWritePlan> {
  const account = operation.account;
  const deployment = toPublicUniswapV4Deployment(getUniswapV4Deployment(operation.chainId));
  const readClient = createUniswapV4ReadClient({ chainId: operation.chainId, deployment });
  const reader = createUniswapV4StateReader({ deployment, readClient });
  const pool = await reader.readPoolSnapshot({
    poolKey: operation.poolKey,
    sourceBlock: operation.sourceBlock,
  });
  switch (operation.kind) {
    case "mint":
    case "increase":
      return prepareAddPlan({
        account,
        deployment,
        operation,
        pool,
        reader,
        readClient,
      });
    case "decrease":
    case "collect":
    case "burn":
      return prepareRemovePlan({
        account,
        allowOwnerPermit,
        deployment,
        operation,
        pool,
        reader,
        readClient,
      });
  }
}

export function toPublicUniswapV4Deployment(deployment: ReturnType<typeof getUniswapV4Deployment>) {
  const provenance = ROBINHOOD_UNISWAP_V4_PROVENANCE;
  return uniswapV4DeploymentSchema.parse({
    ...deployment,
    permit2CodeHash: provenance.codeHashes.permit2,
    poolManagerCodeHash: provenance.codeHashes.poolManager,
    positionManagerCodeHash: provenance.codeHashes.positionManager,
    sourceReferences: [provenance.manifest.sourceRepository],
    stateViewCodeHash: provenance.codeHashes.stateView,
    verifiedAt: {
      blockHash: provenance.block.hash,
      blockNumber: BigInt(provenance.block.number).toString(),
      chainId: deployment.chainId,
    },
  });
}

async function prepareAddPlan(input: {
  readonly account: Address;
  readonly deployment: ReturnType<typeof getUniswapV4Deployment>;
  readonly operation: UniswapV4AddOperation;
  readonly pool: Awaited<
    ReturnType<ReturnType<typeof createUniswapV4StateReader>["readPoolSnapshot"]>
  >;
  readonly readClient: ReturnType<typeof createUniswapV4ReadClient>;
  readonly reader: ReturnType<typeof createUniswapV4StateReader>;
}): Promise<UniswapV4PersistedWritePlan> {
  const position =
    input.operation.kind === "increase"
      ? await input.reader.readPositionSnapshot({
          expectedOwner: input.account,
          poolKey: input.operation.poolKey,
          sourceBlock: input.operation.sourceBlock,
          tokenId: input.operation.tokenId,
        })
      : undefined;
  const allowances = await readAllowances(input);
  const plan = planUniswapV4Add({
    account: input.account,
    allowances,
    deployment: input.deployment,
    operation: input.operation,
    pool: input.pool,
    ...(position === undefined ? {} : { position }),
  });
  return createPersistedUniswapV4WritePlan({
    deployment: input.deployment,
    operation: input.operation,
    plan,
  });
}

async function prepareRemovePlan(input: {
  readonly account: Address;
  readonly allowOwnerPermit: boolean;
  readonly deployment: ReturnType<typeof getUniswapV4Deployment>;
  readonly operation: UniswapV4RemoveOperation;
  readonly pool: Awaited<
    ReturnType<ReturnType<typeof createUniswapV4StateReader>["readPoolSnapshot"]>
  >;
  readonly readClient: ReturnType<typeof createUniswapV4ReadClient>;
  readonly reader: ReturnType<typeof createUniswapV4StateReader>;
}): Promise<UniswapV4PersistedWritePlan> {
  const position = await input.reader.readPositionSnapshot({
    poolKey: input.operation.poolKey,
    sourceBlock: input.operation.sourceBlock,
    tokenId: input.operation.tokenId,
  });
  const accountAuthorized =
    position.owner.toLowerCase() === input.account.toLowerCase() ||
    position.operator.toLowerCase() === input.account.toLowerCase();
  const operatorApprovedForAll = accountAuthorized
    ? false
    : (
        await input.readClient.readPositionManagerApprovalForAll({
          blockNumber: BigInt(input.operation.sourceBlock.blockNumber),
          operator: input.account,
          owner: position.owner,
        })
      ).approved;
  const needsNftPermit = !accountAuthorized && !operatorApprovedForAll;
  if (needsNftPermit && !input.allowOwnerPermit) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_POSITION_UNAUTHORIZED",
      message: "Server wallet is neither the position owner nor its operator",
    });
  }
  const plan = planUniswapV4Remove({
    account: input.account,
    deployment: input.deployment,
    operatorApprovedForAll,
    ...(needsNftPermit ? { nftPermitWillBeAppended: true } : {}),
    operation: input.operation,
    pool: input.pool,
    position,
  });
  const persisted = createPersistedUniswapV4WritePlan({
    deployment: input.deployment,
    operation: input.operation,
    plan,
  });
  if (!needsNftPermit) return persisted;
  return appendNftPermitAction({
    account: input.account,
    deployment: input.deployment,
    operation: input.operation,
    persisted,
    positionOwner: position.owner,
    readClient: input.readClient,
  });
}

async function readAllowances(input: {
  readonly account: Address;
  readonly deployment: ReturnType<typeof getUniswapV4Deployment>;
  readonly operation: UniswapV4AddOperation;
  readonly readClient: ReturnType<typeof createUniswapV4ReadClient>;
}): Promise<readonly UniswapV4TokenAllowance[]> {
  const blockNumber = BigInt(input.operation.sourceBlock.blockNumber);
  const publicClient = getPublicClientCached(input.operation.chainId);
  const tokens = [input.operation.poolKey.currency0, input.operation.poolKey.currency1].filter(
    (currency): currency is Extract<typeof currency, { readonly kind: "erc20" }> =>
      currency.kind === "erc20"
  );
  return Promise.all(
    tokens.map(async (token) => {
      const [erc20Amount, permit2] = await Promise.all([
        publicClient.readContract({
          abi: ERC20_BALANCE_ABI,
          address: token.address,
          args: [input.account, input.deployment.permit2],
          blockNumber,
          functionName: "allowance",
        }),
        input.readClient.readPermit2Allowance({
          blockNumber,
          owner: input.account,
          spender: input.deployment.positionManager,
          token: token.address,
        }),
      ]);
      if (typeof erc20Amount !== "bigint") {
        throw new Web3AgentError({
          code: "UNISWAP_V4_ALLOWANCE_INVALID",
          message: "ERC-20 allowance reader returned a non-integer value",
        });
      }
      return {
        erc20Amount,
        permit2: {
          amount: permit2.amount,
          expiration: permit2.expiration,
          nonce: permit2.nonce,
        },
        sourceBlock: input.operation.sourceBlock,
        token: token.address,
      };
    })
  );
}
