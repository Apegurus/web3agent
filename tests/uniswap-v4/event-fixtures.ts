import { encodeAbiParameters, encodeEventTopics } from "viem";
import type { Address, Hex } from "viem";

import {
  UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
  UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
} from "../../src/uniswap-v4/abis.js";
import type { UniswapV4EventLog } from "../../src/uniswap-v4/events.js";

export const EVENT_FIXTURE_CHAIN_ID = 4663;
export const EVENT_FIXTURE_POOL_A: Hex = `0x${"11".repeat(32)}`;
export const EVENT_FIXTURE_POOL_B: Hex = `0x${"22".repeat(32)}`;
export const EVENT_FIXTURE_SENDER: Address = "0x0000000000000000000000000000000000000001";
export const EVENT_FIXTURE_ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export type EventFixtureDeployment = {
  readonly chainId: number;
  readonly poolManager: Address;
  readonly positionManager: Address;
};

export const eventFixtureDeployment = {
  chainId: EVENT_FIXTURE_CHAIN_ID,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
} as const satisfies EventFixtureDeployment;

export function createInitializeEvent(input: {
  readonly blockNumber: bigint;
  readonly deployment: EventFixtureDeployment;
  readonly logIndex: number;
  readonly poolId: Hex;
  readonly sender?: Address;
  readonly transactionHash?: Hex;
}): UniswapV4EventLog {
  const sender = input.sender ?? EVENT_FIXTURE_SENDER;
  return {
    ...eventMetadata({
      address: input.deployment.poolManager,
      blockNumber: input.blockNumber,
      logIndex: input.logIndex,
      transactionHash: input.transactionHash,
    }),
    data: encodeAbiParameters(
      [
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
        { name: "sqrtPriceX96", type: "uint160" },
        { name: "tick", type: "int24" },
      ],
      [500, 60, sender, 1n, 0]
    ),
    topics: topics(
      encodeEventTopics({
        abi: UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
        args: { currency0: sender, currency1: sender, id: input.poolId },
        eventName: "Initialize",
      })
    ),
  };
}

export function createModifyLiquidityEvent(input: {
  readonly blockNumber: bigint;
  readonly deployment: EventFixtureDeployment;
  readonly liquidityDelta?: bigint;
  readonly logIndex: number;
  readonly poolId: Hex;
  readonly salt: Hex;
  readonly sender?: Address;
  readonly transactionHash?: Hex;
}): UniswapV4EventLog {
  const sender = input.sender ?? EVENT_FIXTURE_SENDER;
  return {
    ...eventMetadata({
      address: input.deployment.poolManager,
      blockNumber: input.blockNumber,
      logIndex: input.logIndex,
      transactionHash: input.transactionHash,
    }),
    data: encodeAbiParameters(
      [
        { name: "tickLower", type: "int24" },
        { name: "tickUpper", type: "int24" },
        { name: "liquidityDelta", type: "int256" },
        { name: "salt", type: "bytes32" },
      ],
      [-60, 60, input.liquidityDelta ?? 4n, input.salt]
    ),
    topics: topics(
      encodeEventTopics({
        abi: UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
        args: { id: input.poolId, sender },
        eventName: "ModifyLiquidity",
      })
    ),
  };
}

export function createModifyPositionEvent(input: {
  readonly blockNumber: bigint;
  readonly deployment: EventFixtureDeployment;
  readonly liquidityDelta?: bigint;
  readonly logIndex: number;
  readonly poolId: Hex;
  readonly salt: Hex;
  readonly sender?: Address;
  readonly transactionHash?: Hex;
}): UniswapV4EventLog {
  const sender = input.sender ?? EVENT_FIXTURE_SENDER;
  return {
    ...eventMetadata({
      address: input.deployment.positionManager,
      blockNumber: input.blockNumber,
      logIndex: input.logIndex,
      transactionHash: input.transactionHash,
    }),
    data: encodeAbiParameters(
      [
        { name: "tickLower", type: "int24" },
        { name: "tickUpper", type: "int24" },
        { name: "liquidityDelta", type: "int256" },
        { name: "salt", type: "bytes32" },
      ],
      [-60, 60, input.liquidityDelta ?? 4n, input.salt]
    ),
    topics: topics(
      encodeEventTopics({
        abi: UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
        args: { id: input.poolId, sender },
        eventName: "ModifyPosition",
      })
    ),
  };
}

export function createTransferEvent(input: {
  readonly blockNumber: bigint;
  readonly deployment: EventFixtureDeployment;
  readonly from: Address;
  readonly logIndex: number;
  readonly to: Address;
  readonly tokenId: bigint;
  readonly transactionHash?: Hex;
}): UniswapV4EventLog {
  return {
    ...eventMetadata({
      address: input.deployment.positionManager,
      blockNumber: input.blockNumber,
      logIndex: input.logIndex,
      transactionHash: input.transactionHash,
    }),
    data: "0x",
    topics: topics(
      encodeEventTopics({
        abi: UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
        args: { from: input.from, id: input.tokenId, to: input.to },
        eventName: "Transfer",
      })
    ),
  };
}

export function createUnknownPositionManagerEvent(input: {
  readonly blockNumber: bigint;
  readonly deployment: EventFixtureDeployment;
  readonly logIndex: number;
}): UniswapV4EventLog {
  return {
    ...eventMetadata({
      address: input.deployment.positionManager,
      blockNumber: input.blockNumber,
      logIndex: input.logIndex,
    }),
    data: "0x",
    topics: [`0x${"99".repeat(32)}`],
  };
}

export function createEventTransport(logs: readonly UniswapV4EventLog[]) {
  return {
    async getChainId(): Promise<number> {
      return EVENT_FIXTURE_CHAIN_ID;
    },
    async getLogs(request: { readonly address: Address }): Promise<readonly UniswapV4EventLog[]> {
      return logs.filter((log) => log.address === request.address);
    },
  };
}

function eventMetadata(input: {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash?: Hex;
}): Pick<
  UniswapV4EventLog,
  "address" | "blockNumber" | "logIndex" | "transactionHash" | "transactionIndex"
> {
  return {
    address: input.address,
    blockNumber: input.blockNumber,
    logIndex: input.logIndex,
    transactionHash:
      input.transactionHash ??
      `0x${"aa".repeat(31)}${input.logIndex.toString(16).padStart(2, "0")}`,
    transactionIndex: 0,
  };
}

function topics(value: readonly (Hex | readonly Hex[] | null)[]): [Hex, ...Hex[]] {
  const [signature, ...rest] = value;
  if (typeof signature !== "string")
    throw new Error("fixture event must include a signature topic");
  return [
    signature,
    ...rest.flatMap((topic) => (topic === null ? [] : Array.isArray(topic) ? topic : [topic])),
  ];
}
