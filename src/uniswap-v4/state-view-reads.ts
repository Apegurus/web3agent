import type { Hex } from "viem";

import { UNISWAP_V4_STATE_VIEW_ABI } from "./abis.js";
import { requireBigint, requireNumber, requireTuple, tupleValue } from "./client-results.js";
import type { UniswapV4ReadCall, UniswapV4ReadExecutor } from "./client-transport.js";
import type { UniswapV4ReadClient, UniswapV4StateViewPool } from "./client.js";
import type { UniswapV4Deployment } from "./deployment-provenance.js";
import { getUniswapV4PositionSalt } from "./position-key.js";

type StateViewReaders = Pick<
  UniswapV4ReadClient,
  "readStateViewFeeGrowthInside" | "readStateViewPool" | "readStateViewPositionInfo"
>;

export function createUniswapV4StateViewReaders(input: {
  readonly deployment: UniswapV4Deployment;
  readonly executor: UniswapV4ReadExecutor;
}): StateViewReaders {
  const readStateViewPool = async (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
  }): Promise<UniswapV4StateViewPool> => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const slot0: UniswapV4ReadCall = {
      abi: UNISWAP_V4_STATE_VIEW_ABI,
      address: input.deployment.stateView,
      args: [request.poolId],
      contract: "StateView",
      functionName: "getSlot0",
    };
    const liquidity: UniswapV4ReadCall = {
      abi: UNISWAP_V4_STATE_VIEW_ABI,
      address: input.deployment.stateView,
      args: [request.poolId],
      contract: "StateView",
      functionName: "getLiquidity",
    };
    const feeGrowth: UniswapV4ReadCall = {
      abi: UNISWAP_V4_STATE_VIEW_ABI,
      address: input.deployment.stateView,
      args: [request.poolId],
      contract: "StateView",
      functionName: "getFeeGrowthGlobals",
    };
    const [slot0Result, liquidityResult, feeGrowthResult] = await input.executor.multicall(
      [slot0, liquidity, feeGrowth],
      blockNumber
    );
    const slot0Values = requireTuple(slot0Result, slot0);
    const feeGrowthValues = requireTuple(feeGrowthResult, feeGrowth);
    return {
      blockNumber,
      feeGrowthGlobal0X128: requireBigint(tupleValue(feeGrowthValues, 0, feeGrowth), feeGrowth),
      feeGrowthGlobal1X128: requireBigint(tupleValue(feeGrowthValues, 1, feeGrowth), feeGrowth),
      liquidity: requireBigint(liquidityResult, liquidity),
      lpFee: requireNumber(tupleValue(slot0Values, 3, slot0), slot0),
      protocolFee: requireNumber(tupleValue(slot0Values, 2, slot0), slot0),
      sqrtPriceX96: requireBigint(tupleValue(slot0Values, 0, slot0), slot0),
      tick: requireNumber(tupleValue(slot0Values, 1, slot0), slot0),
    };
  };
  const readStateViewFeeGrowthInside = async (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
    readonly tickLower: number;
    readonly tickUpper: number;
  }) => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const call: UniswapV4ReadCall = {
      abi: UNISWAP_V4_STATE_VIEW_ABI,
      address: input.deployment.stateView,
      args: [request.poolId, request.tickLower, request.tickUpper],
      contract: "StateView",
      functionName: "getFeeGrowthInside",
    };
    const [result] = await input.executor.multicall([call], blockNumber);
    const values = requireTuple(result, call);
    return {
      blockNumber,
      feeGrowthInside0X128: requireBigint(tupleValue(values, 0, call), call),
      feeGrowthInside1X128: requireBigint(tupleValue(values, 1, call), call),
    };
  };
  const readStateViewPositionInfo = async (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
    readonly tickLower: number;
    readonly tickUpper: number;
    readonly tokenId: bigint;
  }) => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const call: UniswapV4ReadCall = {
      abi: UNISWAP_V4_STATE_VIEW_ABI,
      address: input.deployment.stateView,
      args: [
        request.poolId,
        input.deployment.positionManager,
        request.tickLower,
        request.tickUpper,
        getUniswapV4PositionSalt(request.tokenId),
      ],
      contract: "StateView",
      functionName: "getPositionInfo",
    };
    const [result] = await input.executor.multicall([call], blockNumber);
    const values = requireTuple(result, call);
    return {
      blockNumber,
      feeGrowthInside0LastX128: requireBigint(tupleValue(values, 1, call), call),
      feeGrowthInside1LastX128: requireBigint(tupleValue(values, 2, call), call),
      liquidity: requireBigint(tupleValue(values, 0, call), call),
    };
  };

  return { readStateViewFeeGrowthInside, readStateViewPool, readStateViewPositionInfo };
}
