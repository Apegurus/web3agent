import { type Address, type Hex, isHex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import {
  uint256DecimalSchema,
  uniswapV4BlockReferenceSchema,
  uniswapV4PoolKeySchema,
} from "../api/schemas/uniswap-v4/primitives.js";
import {
  uniswapV4PoolStateSchema,
  uniswapV4PositionStateSchema,
} from "../api/schemas/uniswap-v4/state.js";
import type {
  UniswapV4BlockReference,
  UniswapV4Deployment,
  UniswapV4PoolKey,
  UniswapV4PoolState,
  UniswapV4PositionState,
} from "../api/types.js";
import type { UniswapV4ReadClient } from "./client.js";
import { deriveUniswapV4PositionId } from "./position-key.js";
import { getPoolIdentity, getPositionAmounts } from "./sdk-adapter-api.js";

const POSITION_POOL_ID_MASK =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000n;
const TICK_MASK = 0xffffffn;
const TICK_SIGN_BIT = 0x800000n;
const TICK_MODULUS = 0x1000000n;
const UINT256_MODULUS = 1n << 256n;
const Q128 = 1n << 128n;

export type UniswapV4StateReader = {
  readonly readPoolSnapshot: (request: UniswapV4PoolSnapshotRequest) => Promise<UniswapV4PoolState>;
  readonly readPositionSnapshot: (
    request: UniswapV4PositionSnapshotRequest
  ) => Promise<UniswapV4PositionState>;
};

export type UniswapV4UncollectedFeeEstimateInput = {
  readonly cachedFeeGrowthInsideX128: bigint;
  readonly currentFeeGrowthInsideX128: bigint;
  readonly liquidity: bigint;
};

type UniswapV4PoolSnapshotRequest = {
  readonly poolKey: UniswapV4PoolKey;
  readonly sourceBlock: UniswapV4BlockReference;
};

type UniswapV4PositionSnapshotRequest = UniswapV4PoolSnapshotRequest & {
  readonly expectedOwner?: Address;
  readonly tokenId: string;
};

export function createUniswapV4StateReader(input: {
  readonly deployment: UniswapV4Deployment;
  readonly readClient: UniswapV4ReadClient;
}): UniswapV4StateReader {
  async function readPoolSnapshot(
    request: UniswapV4PoolSnapshotRequest
  ): Promise<UniswapV4PoolState> {
    const { poolKey, sourceBlock } = parsePoolRequest(request);
    const resolvedBlock = await input.readClient.readBlock({
      blockNumber: BigInt(sourceBlock.blockNumber),
    });
    if (
      resolvedBlock.number !== BigInt(sourceBlock.blockNumber) ||
      resolvedBlock.hash.toLowerCase() !== sourceBlock.blockHash.toLowerCase()
    ) {
      throw new Web3AgentError({
        code: "UNISWAP_V4_BLOCK_HASH_MISMATCH",
        details: { expected: sourceBlock, observed: resolvedBlock },
        message: "Source block hash does not match the requested block number",
      });
    }
    const identity = getPoolIdentity(poolKey);
    const pool = await input.readClient.readStateViewPool({
      blockNumber: BigInt(sourceBlock.blockNumber),
      poolId: toPoolId(identity.poolId),
    });

    return uniswapV4PoolStateSchema.parse({
      currentFee: pool.lpFee,
      deployment: input.deployment,
      dynamicFee: (poolKey.fee & 0x800000) !== 0,
      feeGrowthGlobal0X128: pool.feeGrowthGlobal0X128.toString(),
      feeGrowthGlobal1X128: pool.feeGrowthGlobal1X128.toString(),
      initialized: pool.sqrtPriceX96 !== 0n,
      liquidity: pool.liquidity.toString(),
      pool: identity,
      sourceBlock,
      sqrtPriceX96: pool.sqrtPriceX96.toString(),
      tick: pool.tick,
    });
  }

  async function readPositionSnapshot(
    request: UniswapV4PositionSnapshotRequest
  ): Promise<UniswapV4PositionState> {
    const { poolKey, sourceBlock } = parsePoolRequest(request);
    const tokenId = parseTokenId(request.tokenId);
    const poolSnapshot = await readPoolSnapshot({ poolKey, sourceBlock });
    const position = await input.readClient.readPositionManagerPosition({
      blockNumber: BigInt(sourceBlock.blockNumber),
      tokenId,
    });
    const expectedOwner = request.expectedOwner;
    if (
      expectedOwner !== undefined &&
      position.owner.toLowerCase() !== expectedOwner.toLowerCase()
    ) {
      throw new Web3AgentError({
        code: "UNISWAP_V4_POSITION_OWNER_MISMATCH",
        details: { expectedOwner, owner: position.owner, tokenId: request.tokenId },
        message: "Position owner does not match the requested owner",
      });
    }
    assertMatchingPoolKey(poolKey, poolSnapshot.pool.poolId, position);

    const tickLower = decodeTick(position.positionInfo, 8n);
    const tickUpper = decodeTick(position.positionInfo, 32n);
    const positionId = deriveUniswapV4PositionId({
      owner: input.deployment.positionManager,
      tickLower,
      tickUpper,
      tokenId,
    });
    const feeGrowthInside = await input.readClient.readStateViewFeeGrowthInside({
      blockNumber: BigInt(sourceBlock.blockNumber),
      poolId: toPoolId(poolSnapshot.pool.poolId),
      tickLower,
      tickUpper,
    });
    const positionInfo = await input.readClient.readStateViewPositionInfo({
      blockNumber: BigInt(sourceBlock.blockNumber),
      poolId: toPoolId(poolSnapshot.pool.poolId),
      tickLower,
      tickUpper,
      tokenId,
    });
    const initialized = poolSnapshot.initialized && positionInfo.liquidity > 0n;
    const amounts = initialized
      ? getPositionAmounts({
          liquidity: positionInfo.liquidity,
          poolKey,
          slippageBps: 0,
          sqrtPriceX96: BigInt(poolSnapshot.sqrtPriceX96),
          tickCurrent: poolSnapshot.tick,
          tickLower,
          tickUpper,
        }).current
      : { amount0: 0n, amount1: 0n };

    return uniswapV4PositionStateSchema.parse({
      amount0: amounts.amount0.toString(),
      amount1: amounts.amount1.toString(),
      feeGrowthInside0LastX128: positionInfo.feeGrowthInside0LastX128.toString(),
      feeGrowthInside0X128: feeGrowthInside.feeGrowthInside0X128.toString(),
      feeGrowthInside1LastX128: positionInfo.feeGrowthInside1LastX128.toString(),
      feeGrowthInside1X128: feeGrowthInside.feeGrowthInside1X128.toString(),
      liquidity: positionInfo.liquidity.toString(),
      operator: position.operator,
      owner: position.owner,
      pool: poolSnapshot.pool,
      positionId,
      sourceBlock,
      tickLower,
      tickUpper,
      tokenId: tokenId.toString(),
      tokensOwedAvailability: "not-exposed-by-uniswap-v4-core",
      uncollectedFees0: estimateUncollectedFees({
        cachedFeeGrowthInsideX128: positionInfo.feeGrowthInside0LastX128,
        currentFeeGrowthInsideX128: feeGrowthInside.feeGrowthInside0X128,
        liquidity: positionInfo.liquidity,
      }).toString(),
      uncollectedFees1: estimateUncollectedFees({
        cachedFeeGrowthInsideX128: positionInfo.feeGrowthInside1LastX128,
        currentFeeGrowthInsideX128: feeGrowthInside.feeGrowthInside1X128,
        liquidity: positionInfo.liquidity,
      }).toString(),
    });
  }

  return { readPoolSnapshot, readPositionSnapshot };
}

function parseTokenId(tokenId: string): bigint {
  return BigInt(uint256DecimalSchema.parse(tokenId));
}

/**
 * Mirrors v4-core Position.sol: unchecked uint256 growth subtraction, then FullMath.mulDiv by Q128.
 */
export function estimateUncollectedFees(input: UniswapV4UncollectedFeeEstimateInput): bigint {
  const growthDelta =
    (input.currentFeeGrowthInsideX128 - input.cachedFeeGrowthInsideX128 + UINT256_MODULUS) %
    UINT256_MODULUS;
  return (growthDelta * input.liquidity) / Q128;
}

function parsePoolRequest(request: UniswapV4PoolSnapshotRequest): {
  readonly poolKey: UniswapV4PoolKey;
  readonly sourceBlock: UniswapV4BlockReference;
} {
  const poolKey = uniswapV4PoolKeySchema.parse(request.poolKey);
  const sourceBlock = uniswapV4BlockReferenceSchema.parse(request.sourceBlock);
  if (poolKey.currency0.chainId !== sourceBlock.chainId) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_BLOCK_CHAIN_MISMATCH",
      details: { poolChainId: poolKey.currency0.chainId, sourceBlock },
      message: "PoolKey chain ID must match the explicit source block chain ID",
    });
  }
  return { poolKey, sourceBlock };
}

function assertMatchingPoolKey(
  poolKey: UniswapV4PoolKey,
  poolId: string,
  position: Awaited<ReturnType<UniswapV4ReadClient["readPositionManagerPosition"]>>
): void {
  const currency0 =
    poolKey.currency0.kind === "native"
      ? "0x0000000000000000000000000000000000000000"
      : poolKey.currency0.address;
  const currency1 =
    poolKey.currency1.kind === "native"
      ? "0x0000000000000000000000000000000000000000"
      : poolKey.currency1.address;
  const rawKeyMatches =
    currency0.toLowerCase() === position.poolKey.currency0.toLowerCase() &&
    currency1.toLowerCase() === position.poolKey.currency1.toLowerCase() &&
    poolKey.fee === position.poolKey.fee &&
    poolKey.tickSpacing === position.poolKey.tickSpacing &&
    poolKey.hooks.toLowerCase() === position.poolKey.hooks.toLowerCase();
  const positionPoolId = position.positionInfo & POSITION_POOL_ID_MASK;
  const computedPoolId = BigInt(poolId) & POSITION_POOL_ID_MASK;
  if (!rawKeyMatches || positionPoolId !== computedPoolId) {
    throw new Web3AgentError({
      code: "POOL_KEY_MISMATCH",
      details: { computedPoolId: poolId, storedPoolKey: position.poolKey },
      message: "Caller PoolKey does not match the stored position PoolKey",
    });
  }
}

function decodeTick(positionInfo: bigint, offset: bigint): number {
  const value = Number((positionInfo >> offset) & TICK_MASK);
  return value >= Number(TICK_SIGN_BIT) ? value - Number(TICK_MODULUS) : value;
}

function toPoolId(poolId: string): Hex {
  if (!isHex(poolId, { strict: true })) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_INVALID_POOL_ID",
      details: { poolId },
      message: "SDK adapter returned an invalid PoolId",
    });
  }
  return poolId;
}
