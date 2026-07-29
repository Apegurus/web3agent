import type { Address } from "viem";

import { Web3AgentError } from "../api/errors.js";
import {
  ERC20_METADATA_ABI,
  PERMIT2_ALLOWANCE_ABI,
  UNISWAP_V4_POOL_MANAGER_ABI,
  UNISWAP_V4_POSITION_MANAGER_ABI,
} from "./abis.js";
import {
  requireAddress,
  requireBigint,
  requireNumber,
  requireString,
  requireTuple,
  tupleValue,
} from "./client-results.js";
import type { UniswapV4ReadCall, UniswapV4ReadExecutor } from "./client-transport.js";
import type {
  TokenReference,
  UniswapV4PositionManagerPosition,
  UniswapV4ReadClient,
  UniswapV4TokenMetadata,
} from "./client.js";
import type { UniswapV4Deployment } from "./deployment-provenance.js";
import { createUniswapV4StateViewReaders } from "./state-view-reads.js";

type Readers = Pick<
  UniswapV4ReadClient,
  | "readPermit2Allowance"
  | "readPoolManagerProtocolFeeController"
  | "readPositionManagerPosition"
  | "readPositionManagerNonce"
  | "readStateViewPool"
  | "readStateViewFeeGrowthInside"
  | "readStateViewPositionInfo"
  | "readTokenMetadata"
>;

export function createUniswapV4Readers(input: {
  readonly chainId: number;
  readonly deployment: UniswapV4Deployment;
  readonly executor: UniswapV4ReadExecutor;
}): Readers {
  const stateViewReaders = createUniswapV4StateViewReaders(input);
  const readPoolManagerProtocolFeeController = async (
    request: { readonly blockNumber?: bigint } = {}
  ) => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const call: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POOL_MANAGER_ABI,
      address: input.deployment.poolManager,
      args: [],
      contract: "PoolManager",
      functionName: "protocolFeeController",
    };
    return {
      blockNumber,
      protocolFeeController: requireAddress(await input.executor.read(call, blockNumber), call),
    };
  };
  const readPositionManagerPosition = async (request: {
    readonly blockNumber?: bigint;
    readonly tokenId: bigint;
  }): Promise<UniswapV4PositionManagerPosition> => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const owner: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POSITION_MANAGER_ABI,
      address: input.deployment.positionManager,
      args: [request.tokenId],
      contract: "PositionManager",
      functionName: "ownerOf",
    };
    const operator: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POSITION_MANAGER_ABI,
      address: input.deployment.positionManager,
      args: [request.tokenId],
      contract: "PositionManager",
      functionName: "getApproved",
    };
    const liquidity: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POSITION_MANAGER_ABI,
      address: input.deployment.positionManager,
      args: [request.tokenId],
      contract: "PositionManager",
      functionName: "getPositionLiquidity",
    };
    const poolAndPositionInfo: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POSITION_MANAGER_ABI,
      address: input.deployment.positionManager,
      args: [request.tokenId],
      contract: "PositionManager",
      functionName: "getPoolAndPositionInfo",
    };
    const [ownerResult, operatorResult, liquidityResult, poolAndPositionResult] =
      await input.executor.multicall(
        [owner, operator, liquidity, poolAndPositionInfo],
        blockNumber
      );
    const poolAndPositionValues = requireTuple(poolAndPositionResult, poolAndPositionInfo);
    const poolKeyValues = requireTuple(
      tupleValue(poolAndPositionValues, 0, poolAndPositionInfo),
      poolAndPositionInfo
    );
    return {
      blockNumber,
      liquidity: requireBigint(liquidityResult, liquidity),
      operator: requireAddress(operatorResult, operator),
      owner: requireAddress(ownerResult, owner),
      poolKey: {
        currency0: requireAddress(
          tupleValue(poolKeyValues, 0, poolAndPositionInfo),
          poolAndPositionInfo
        ),
        currency1: requireAddress(
          tupleValue(poolKeyValues, 1, poolAndPositionInfo),
          poolAndPositionInfo
        ),
        fee: requireNumber(tupleValue(poolKeyValues, 2, poolAndPositionInfo), poolAndPositionInfo),
        hooks: requireAddress(
          tupleValue(poolKeyValues, 4, poolAndPositionInfo),
          poolAndPositionInfo
        ),
        tickSpacing: requireNumber(
          tupleValue(poolKeyValues, 3, poolAndPositionInfo),
          poolAndPositionInfo
        ),
      },
      positionInfo: requireBigint(
        tupleValue(poolAndPositionValues, 1, poolAndPositionInfo),
        poolAndPositionInfo
      ),
    };
  };
  const readPositionManagerNonce = async (request: {
    readonly blockNumber?: bigint;
    readonly tokenId: bigint;
  }) => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const call: UniswapV4ReadCall = {
      abi: UNISWAP_V4_POSITION_MANAGER_ABI,
      address: input.deployment.positionManager,
      args: [request.tokenId],
      contract: "PositionManager",
      functionName: "nonce",
    };
    return {
      blockNumber,
      nonce: requireBigint(await input.executor.read(call, blockNumber), call),
    };
  };
  const readPermit2Allowance = async (request: {
    readonly blockNumber?: bigint;
    readonly owner: Address;
    readonly spender: Address;
    readonly token: Address;
  }) => {
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const call: UniswapV4ReadCall = {
      abi: PERMIT2_ALLOWANCE_ABI,
      address: input.deployment.permit2,
      args: [request.owner, request.token, request.spender],
      contract: "Permit2",
      functionName: "allowance",
    };
    const allowance = requireTuple(await input.executor.read(call, blockNumber), call);
    return {
      amount: requireBigint(tupleValue(allowance, 0, call), call),
      blockNumber,
      expiration: requireBigint(tupleValue(allowance, 1, call), call),
      nonce: requireBigint(tupleValue(allowance, 2, call), call),
    };
  };
  const readTokenMetadata = async (request: {
    readonly blockNumber?: bigint;
    readonly token: TokenReference;
  }): Promise<UniswapV4TokenMetadata> => {
    if (request.token.chainId !== input.chainId) {
      throw new Web3AgentError({
        code: "UNISWAP_V4_TOKEN_CHAIN_MISMATCH",
        details: {
          expectedChainId: input.chainId,
          token: request.token.address,
          tokenChainId: request.token.chainId,
        },
        message: "Token belongs to another chain",
      });
    }
    const blockNumber = await input.executor.resolveBlock(request.blockNumber);
    const name: UniswapV4ReadCall = {
      abi: ERC20_METADATA_ABI,
      address: request.token.address,
      args: [],
      contract: "ERC20",
      functionName: "name",
    };
    const symbol: UniswapV4ReadCall = {
      abi: ERC20_METADATA_ABI,
      address: request.token.address,
      args: [],
      contract: "ERC20",
      functionName: "symbol",
    };
    const decimals: UniswapV4ReadCall = {
      abi: ERC20_METADATA_ABI,
      address: request.token.address,
      args: [],
      contract: "ERC20",
      functionName: "decimals",
    };
    const [nameResult, symbolResult, decimalsResult] = await input.executor.multicall(
      [name, symbol, decimals],
      blockNumber
    );
    return {
      blockNumber,
      decimals: requireNumber(decimalsResult, decimals),
      name: requireString(nameResult, name),
      symbol: requireString(symbolResult, symbol),
    };
  };
  return {
    readPermit2Allowance,
    readPoolManagerProtocolFeeController,
    readPositionManagerPosition,
    readPositionManagerNonce,
    ...stateViewReaders,
    readTokenMetadata,
  };
}
