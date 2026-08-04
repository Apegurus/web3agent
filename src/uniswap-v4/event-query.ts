import { Web3AgentError } from "../api/errors.js";
import { uniswapV4EventQuerySchema } from "../api/schemas/uniswap-v4/events.js";
import {
  UNISWAP_V4_MAX_EVENT_BLOCK_SPAN,
  UNISWAP_V4_MAX_EVENT_PAGE_SIZE,
} from "../api/schemas/uniswap-v4/primitives.js";
import type { UniswapV4EventQuery } from "../api/types.js";

export type PoolEventKind = "donate" | "initialize" | "modifyLiquidity" | "positionModify" | "swap";
export type PositionEventKind = "positionLifecycle" | "positionTransfer";

export type NormalizedEventQuery =
  | {
      readonly chainId: number;
      readonly endBlock: bigint;
      readonly endBlockText: string;
      readonly eventKinds: readonly PoolEventKind[];
      readonly pageSize: number;
      readonly poolId: string;
      readonly scope: "pool";
      readonly startBlock: bigint;
      readonly startBlockText: string;
    }
  | {
      readonly chainId: number;
      readonly endBlock: bigint;
      readonly endBlockText: string;
      readonly eventKinds: readonly PositionEventKind[];
      readonly pageSize: number;
      readonly scope: "position";
      readonly startBlock: bigint;
      readonly startBlockText: string;
      readonly tokenId: string;
    };

function eventError(code: string, message: string, details?: unknown): Web3AgentError {
  return new Web3AgentError({ code, details, message });
}

function parseBlock(value: string, name: "startBlock" | "endBlock"): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw eventError("UNISWAP_V4_EVENT_RANGE_INVALID", `${name} must be a canonical block number`);
  }
  return BigInt(value);
}

function normalizeKinds<T extends string>(kinds: readonly T[] | undefined): readonly T[] {
  return [...(kinds ?? [])].sort();
}

export function normalizeEventQuery(input: UniswapV4EventQuery): NormalizedEventQuery {
  const parsed = uniswapV4EventQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw eventError(
      "UNISWAP_V4_EVENT_QUERY_INVALID",
      "event query is invalid",
      parsed.error.issues
    );
  }
  const startBlock = parseBlock(parsed.data.startBlock, "startBlock");
  const endBlock = parseBlock(parsed.data.endBlock, "endBlock");
  if (endBlock < startBlock) {
    throw eventError("UNISWAP_V4_EVENT_RANGE_INVALID", "endBlock must not precede startBlock");
  }
  if (endBlock - startBlock + 1n > BigInt(UNISWAP_V4_MAX_EVENT_BLOCK_SPAN)) {
    throw eventError(
      "UNISWAP_V4_EVENT_RANGE_TOO_LARGE",
      "event range exceeds the configured maximum span"
    );
  }
  if (parsed.data.pageSize > UNISWAP_V4_MAX_EVENT_PAGE_SIZE) {
    throw eventError(
      "UNISWAP_V4_EVENT_PAGE_SIZE_INVALID",
      "event page size exceeds the configured maximum"
    );
  }
  if (parsed.data.scope === "pool") {
    return {
      chainId: parsed.data.chainId,
      endBlock,
      endBlockText: parsed.data.endBlock,
      eventKinds: normalizeKinds(parsed.data.eventKinds),
      pageSize: parsed.data.pageSize,
      poolId: parsed.data.poolId.toLowerCase(),
      scope: "pool",
      startBlock,
      startBlockText: parsed.data.startBlock,
    };
  }
  return {
    chainId: parsed.data.chainId,
    endBlock,
    endBlockText: parsed.data.endBlock,
    eventKinds: normalizeKinds(parsed.data.eventKinds),
    pageSize: parsed.data.pageSize,
    scope: "position",
    startBlock,
    startBlockText: parsed.data.startBlock,
    tokenId: parsed.data.tokenId,
  };
}
