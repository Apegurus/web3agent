import { type Address, type Hex, toEventSelector } from "viem";

import type { UniswapV4Event } from "../api/types.js";
import { decodePoolManagerEvent, decodePositionManagerTransfer } from "./event-decoding.js";
import type { UniswapV4EventLog } from "./event-types.js";

type ReceiptLifecycleLog = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly data: Hex;
  readonly logIndex: number;
  readonly topics: readonly Hex[];
  readonly transactionHash: Hex;
  readonly transactionIndex: number;
};

type ReceiptDeployment = {
  readonly poolManager: Address;
  readonly positionManager: Address;
};

const POOL_MANAGER_EVENT_TOPICS = new Set([
  toEventSelector("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"),
  toEventSelector("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"),
  toEventSelector("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"),
  toEventSelector("Donate(bytes32,address,uint256,uint256)"),
]);
const POSITION_MANAGER_TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");

export function decodeUniswapV4ReceiptEvents(input: {
  readonly deployment: ReceiptDeployment;
  readonly logs: readonly ReceiptLifecycleLog[];
  readonly poolId: string;
  readonly tokenId?: string;
}): readonly UniswapV4Event[] {
  return input.logs
    .flatMap((log) => decodeReceiptLog(log, input.deployment))
    .filter((event) => matchesReceiptScope(event, input.poolId, input.tokenId))
    .sort(compareEvents);
}

function decodeReceiptLog(
  log: ReceiptLifecycleLog,
  deployment: ReceiptDeployment
): readonly UniswapV4Event[] {
  const normalizedLog = toEventLog(log);
  if (!normalizedLog) return [];
  const topic = normalizedLog.topics[0];
  if (log.address.toLowerCase() === deployment.poolManager.toLowerCase()) {
    if (!POOL_MANAGER_EVENT_TOPICS.has(topic)) return [];
    return asEvents(decodePoolManagerEvent(normalizedLog));
  }
  if (log.address.toLowerCase() !== deployment.positionManager.toLowerCase()) return [];
  if (topic === POSITION_MANAGER_TRANSFER_TOPIC) {
    return asEvents(decodePositionManagerTransfer(normalizedLog));
  }
  return [];
}

function asEvents(event: UniswapV4Event | undefined): readonly UniswapV4Event[] {
  return event === undefined ? [] : [event];
}

function toEventLog(log: ReceiptLifecycleLog): UniswapV4EventLog | undefined {
  const [firstTopic, ...remainingTopics] = log.topics;
  if (!firstTopic) return undefined;
  return { ...log, topics: [firstTopic, ...remainingTopics] };
}

function matchesReceiptScope(event: UniswapV4Event, poolId: string, tokenId?: string): boolean {
  if (event.poolAssociation.kind === "associated") {
    return event.poolAssociation.poolId.toLowerCase() === poolId.toLowerCase();
  }
  return tokenId === undefined || ("tokenId" in event && event.tokenId === tokenId);
}

function compareEvents(left: UniswapV4Event, right: UniswapV4Event): number {
  const block = BigInt(left.blockNumber) - BigInt(right.blockNumber);
  if (block !== 0n) return block < 0n ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex - right.transactionIndex;
  }
  return left.logIndex - right.logIndex;
}
