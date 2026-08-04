import type {
  UniswapV4BlockReference,
  UniswapV4Deployment,
  UniswapV4PoolKey,
} from "../../src/api/types.js";
import {
  type UniswapV4ReadTransport,
  createUniswapV4ReadClient,
} from "../../src/uniswap-v4/client.js";
import { getPoolIdentity } from "../../src/uniswap-v4/sdk-adapter-api.js";
import { createUniswapV4StateReader } from "../../src/uniswap-v4/state.js";

export const CHAIN_ID = 4663;
export const BLOCK_NUMBER = 16_437_583n;
export const BLOCK_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const TOKEN = "0x2222222222222222222222222222222222222222";
export const OWNER = "0x3333333333333333333333333333333333333333";
export const OPERATOR = "0x4444444444444444444444444444444444444444";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const sourceBlock: UniswapV4BlockReference = {
  blockHash: BLOCK_HASH,
  blockNumber: BLOCK_NUMBER.toString(),
  chainId: CHAIN_ID,
};

export const deployment: UniswapV4Deployment = {
  chainId: CHAIN_ID,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  permit2CodeHash: BLOCK_HASH,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  poolManagerCodeHash: BLOCK_HASH,
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  positionManagerCodeHash: BLOCK_HASH,
  sourceReferences: ["https://example.test/uniswap-v4"],
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  stateViewCodeHash: BLOCK_HASH,
  verifiedAt: sourceBlock,
};

export const poolKey: UniswapV4PoolKey = {
  currency0: {
    chainId: CHAIN_ID,
    decimals: 18,
    kind: "native",
    name: "Ether",
    symbol: "ETH",
  },
  currency1: {
    address: TOKEN,
    chainId: CHAIN_ID,
    decimals: 18,
    kind: "erc20",
    name: "Fixture Token",
    symbol: "FIX",
  },
  fee: 0x800000,
  hooks: OPERATOR,
  tickSpacing: 60,
};

const POSITION_POOL_ID_MASK =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000n;
const POSITION_POOL_PREFIX = BigInt(getPoolIdentity(poolKey).poolId) & POSITION_POOL_ID_MASK;

export type StateFixtureOptions = {
  readonly cachedFeeGrowthInside0X128?: bigint;
  readonly cachedFeeGrowthInside1X128?: bigint;
  readonly currentFeeGrowthInside0X128?: bigint;
  readonly currentFeeGrowthInside1X128?: bigint;
  readonly liquidity?: bigint;
  readonly owner?: string;
  readonly positionManagerLiquidity?: bigint;
  readonly sqrtPriceX96?: bigint;
  readonly tick?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
};

function positionInfo(tickLower: number, tickUpper: number): bigint {
  const lower = BigInt.asUintN(24, BigInt(tickLower));
  const upper = BigInt.asUintN(24, BigInt(tickUpper));
  return POSITION_POOL_PREFIX | (upper << 32n) | (lower << 8n);
}

function fixtureTransport(options: StateFixtureOptions): UniswapV4ReadTransport {
  const liquidity = options.liquidity ?? 77n;
  const sqrtPriceX96 = options.sqrtPriceX96 ?? 79228162514264337593543950336n;
  return {
    async getBlock(request) {
      return {
        hash:
          request.blockNumber === BLOCK_NUMBER
            ? BLOCK_HASH
            : "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        number: request.blockNumber,
      };
    },
    async getBlockNumber(): Promise<bigint> {
      return BLOCK_NUMBER;
    },
    async getChainId(): Promise<number> {
      return CHAIN_ID;
    },
    async multicall(request) {
      return request.contracts.map((contract) => {
        switch (contract.functionName) {
          case "getSlot0":
            return {
              result: [sqrtPriceX96, options.tick ?? 0, 11, 500],
              status: "success",
            } as const;
          case "getLiquidity":
            return { result: 900n, status: "success" } as const;
          case "getFeeGrowthGlobals":
            return { result: [101n, 202n], status: "success" } as const;
          case "getFeeGrowthInside":
            return {
              result: [
                options.currentFeeGrowthInside0X128 ?? 3n << 128n,
                options.currentFeeGrowthInside1X128 ?? 4n << 128n,
              ],
              status: "success",
            } as const;
          case "getPositionInfo":
            return {
              result: [
                liquidity,
                options.cachedFeeGrowthInside0X128 ?? 1n << 128n,
                options.cachedFeeGrowthInside1X128 ?? 2n << 128n,
              ],
              status: "success",
            } as const;
          case "ownerOf":
            return { result: options.owner ?? OWNER, status: "success" } as const;
          case "getApproved":
            return { result: OPERATOR, status: "success" } as const;
          case "getPositionLiquidity":
            return {
              result: options.positionManagerLiquidity ?? liquidity,
              status: "success",
            } as const;
          case "getPoolAndPositionInfo":
            return {
              result: [
                [ZERO_ADDRESS, TOKEN, 0x800000, 60, OPERATOR],
                positionInfo(options.tickLower ?? -120, options.tickUpper ?? 120),
              ],
              status: "success",
            } as const;
          default:
            throw new Error(`Unexpected multicall function ${contract.functionName}`);
        }
      });
    },
    async readContract() {
      throw new Error("Todo 7 snapshot reads must not use unrelated direct calls");
    },
  };
}

export function createFixtureReader(options: StateFixtureOptions = {}) {
  return createUniswapV4StateReader({
    deployment,
    readClient: createFixtureReadClient(options),
  });
}

export function createFixtureReadClient(options: StateFixtureOptions = {}) {
  return createUniswapV4ReadClient({
    chainId: CHAIN_ID,
    client: fixtureTransport(options),
  });
}
