import { Web3AgentError } from "../api/errors.js";
import {
  uniswapV4BurnOperationSchema,
  uniswapV4CollectOperationSchema,
  uniswapV4DecreaseOperationSchema,
} from "../api/schemas/uniswap-v4/lifecycle.js";
import {
  uniswapV4PoolStateSchema,
  uniswapV4PositionStateSchema,
} from "../api/schemas/uniswap-v4/state.js";
import { getUniswapV4Deployment } from "./deployments.js";
import { assertCanonicalDeployment } from "./planner-guards.js";
import type {
  UniswapV4NftPermit,
  UniswapV4RemoveOperation,
  UniswapV4RemovePlanInput,
} from "./planner-types.js";
import { getPoolIdentity } from "./sdk-adapter-api.js";

export function assertRemovePlanInput(input: UniswapV4RemovePlanInput): UniswapV4RemoveOperation {
  const operation = parseRemoveOperation(input.operation);
  const pool = uniswapV4PoolStateSchema.parse(input.pool);
  const position = uniswapV4PositionStateSchema.parse(input.position);
  const poolId = getPoolIdentity(operation.poolKey).poolId;
  const now = input.now ?? BigInt(Math.floor(Date.now() / 1000));
  if (operation.account.toLowerCase() !== input.account.toLowerCase()) {
    throw plannerError(
      "UNISWAP_V4_PLANNER_ACCOUNT_MISMATCH",
      "Plan account must match the operation account"
    );
  }
  if (BigInt(operation.deadline) <= now) {
    throw plannerError("UNISWAP_V4_DEADLINE_EXPIRED", "Operation deadline must be in the future");
  }
  if (operation.hookData !== "0x" && operation.poolKey.hooks.toLowerCase() === zeroAddress) {
    throw plannerError(
      "UNISWAP_V4_HOOK_DATA_INVALID",
      "Hook data requires a non-zero pool hook address"
    );
  }
  if (input.deployment.chainId !== operation.chainId) {
    throw plannerError(
      "UNISWAP_V4_DEPLOYMENT_CHAIN_MISMATCH",
      "Deployment chain must match the operation"
    );
  }
  assertCanonicalDeployment(input.deployment, getUniswapV4Deployment(operation.chainId));
  if (
    pool.sourceBlock.blockHash.toLowerCase() !== operation.sourceBlock.blockHash.toLowerCase() ||
    pool.sourceBlock.blockNumber !== operation.sourceBlock.blockNumber ||
    pool.pool.poolId.toLowerCase() !== poolId.toLowerCase()
  ) {
    throw plannerError(
      "UNISWAP_V4_POOL_STATE_MISMATCH",
      "Pool state does not match the pinned operation source"
    );
  }
  if (
    position.sourceBlock.blockHash.toLowerCase() !==
      operation.sourceBlock.blockHash.toLowerCase() ||
    position.sourceBlock.blockNumber !== operation.sourceBlock.blockNumber ||
    position.pool.poolId.toLowerCase() !== poolId.toLowerCase() ||
    position.tokenId !== operation.tokenId
  ) {
    throw plannerError(
      "UNISWAP_V4_POSITION_STATE_MISMATCH",
      "Position state does not match the pinned operation and token ID"
    );
  }
  if (operation.kind !== "collect") {
    const recipient = operation.recipient;
    if (recipient === undefined) {
      throw plannerError(
        "UNISWAP_V4_REMOVE_RECIPIENT_REQUIRED",
        "Decrease and burn require an explicit recipient"
      );
    }
    if (recipient.toLowerCase() !== input.account.toLowerCase()) {
      throw plannerError(
        "UNISWAP_V4_REMOVE_RECIPIENT_INVALID",
        "Decrease and burn proceeds must explicitly target the transaction sender"
      );
    }
  }
  if (operation.kind !== "collect" && BigInt(position.liquidity) === 0n) {
    throw plannerError(
      "UNISWAP_V4_POSITION_LIQUIDITY_EMPTY",
      "Decrease and burn require non-zero position liquidity"
    );
  }
  assertAuthorization(input, position.owner, position.operator, BigInt(operation.tokenId), now);
  return operation;
}

function parseRemoveOperation(operation: UniswapV4RemoveOperation): UniswapV4RemoveOperation {
  switch (operation.kind) {
    case "decrease":
      return uniswapV4DecreaseOperationSchema.parse(operation);
    case "collect":
      return uniswapV4CollectOperationSchema.parse(operation);
    case "burn":
      return uniswapV4BurnOperationSchema.parse(operation);
  }
}

function assertAuthorization(
  input: UniswapV4RemovePlanInput,
  owner: string,
  operator: string,
  tokenId: bigint,
  now: bigint
): void {
  const account = input.account.toLowerCase();
  if (input.nftPermit !== undefined) {
    assertNftPermit(input, input.nftPermit, tokenId, now);
  }
  if (owner.toLowerCase() === account || operator.toLowerCase() === account) {
    return;
  }
  if (input.nftPermitWillBeAppended === true) {
    return;
  }
  const permit = input.nftPermit;
  if (permit === undefined) {
    throw plannerError(
      "UNISWAP_V4_POSITION_UNAUTHORIZED",
      "Account is neither the position owner nor its operator"
    );
  }
}

function assertNftPermit(
  input: UniswapV4RemovePlanInput,
  permit: UniswapV4NftPermit,
  tokenId: bigint,
  now: bigint
): void {
  if (
    permit.domain.chainId !== input.deployment.chainId ||
    permit.domain.name !== "Uniswap V4 Positions NFT" ||
    permit.domain.verifyingContract.toLowerCase() !== input.deployment.positionManager.toLowerCase()
  ) {
    throw plannerError(
      "UNISWAP_V4_NFT_PERMIT_DOMAIN_INVALID",
      "NFT permit domain must target the canonical PositionManager"
    );
  }
  if (permit.spender.toLowerCase() !== input.account.toLowerCase() || permit.tokenId !== tokenId) {
    throw plannerError(
      "UNISWAP_V4_NFT_PERMIT_TARGET_INVALID",
      "NFT permit must authorize this account and token ID"
    );
  }
  if (permit.deadline <= now) {
    throw plannerError(
      "UNISWAP_V4_NFT_PERMIT_EXPIRED",
      "NFT permit deadline must be in the future"
    );
  }
  if (input.nftPermitNonce !== permit.nonce) {
    throw plannerError(
      "UNISWAP_V4_NFT_PERMIT_NONCE_STALE",
      "NFT permit nonce must match the pinned PositionManager nonce"
    );
  }
}

function plannerError(code: string, message: string): Web3AgentError {
  return new Web3AgentError({ code, message });
}

const zeroAddress = "0x0000000000000000000000000000000000000000";
