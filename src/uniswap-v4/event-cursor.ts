import { Buffer } from "node:buffer";

import { Web3AgentError } from "../api/errors.js";
import type { NormalizedEventQuery, PoolEventKind, PositionEventKind } from "./event-query.js";

const CURSOR_ORDER = "block-transaction-log-asc";
const CURSOR_VERSION = 2;

type EventCursor =
  | {
      readonly chainId: number;
      readonly endBlockText: string;
      readonly eventKinds: readonly PoolEventKind[];
      readonly offset: number;
      readonly order: typeof CURSOR_ORDER;
      readonly pageSize: number;
      readonly poolId: string;
      readonly scope: "pool";
      readonly startBlockText: string;
      readonly version: typeof CURSOR_VERSION;
    }
  | {
      readonly chainId: number;
      readonly endBlockText: string;
      readonly eventKinds: readonly PositionEventKind[];
      readonly offset: number;
      readonly order: typeof CURSOR_ORDER;
      readonly pageSize: number;
      readonly scope: "position";
      readonly startBlockText: string;
      readonly tokenId: string;
      readonly version: typeof CURSOR_VERSION;
    };

type CursorBase = {
  readonly chainId: number;
  readonly endBlockText: string;
  readonly offset: number;
  readonly order: typeof CURSOR_ORDER;
  readonly pageSize: number;
  readonly startBlockText: string;
  readonly version: typeof CURSOR_VERSION;
};

function eventError(code: string, message: string): Web3AgentError {
  return new Web3AgentError({ code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPoolKind(value: unknown): value is PoolEventKind {
  return (
    value === "donate" ||
    value === "initialize" ||
    value === "modifyLiquidity" ||
    value === "positionModify" ||
    value === "swap"
  );
}

function isPositionKind(value: unknown): value is PositionEventKind {
  return value === "positionLifecycle" || value === "positionTransfer";
}

function isCursorBase(
  value: Record<string, unknown>
): value is Record<string, unknown> & CursorBase {
  return (
    value.version === CURSOR_VERSION &&
    typeof value.chainId === "number" &&
    typeof value.endBlockText === "string" &&
    typeof value.offset === "number" &&
    value.order === CURSOR_ORDER &&
    typeof value.pageSize === "number" &&
    typeof value.startBlockText === "string"
  );
}

function decodeCursor(value: unknown): EventCursor | undefined {
  if (!isRecord(value) || !isCursorBase(value) || !Array.isArray(value.eventKinds))
    return undefined;
  if (
    value.scope === "pool" &&
    typeof value.poolId === "string" &&
    value.eventKinds.every(isPoolKind)
  ) {
    return {
      ...value,
      eventKinds: [...value.eventKinds].sort(),
      poolId: value.poolId,
      scope: "pool",
    };
  }
  if (
    value.scope === "position" &&
    typeof value.tokenId === "string" &&
    value.eventKinds.every(isPositionKind)
  ) {
    return {
      ...value,
      eventKinds: [...value.eventKinds].sort(),
      scope: "position",
      tokenId: value.tokenId,
    };
  }
  return undefined;
}

function matchesQuery(cursor: EventCursor, query: NormalizedEventQuery): boolean {
  if (
    cursor.chainId !== query.chainId ||
    cursor.endBlockText !== query.endBlockText ||
    cursor.pageSize !== query.pageSize ||
    cursor.scope !== query.scope ||
    cursor.startBlockText !== query.startBlockText ||
    JSON.stringify(cursor.eventKinds) !== JSON.stringify(query.eventKinds)
  ) {
    return false;
  }
  return cursor.scope === "pool" && query.scope === "pool"
    ? cursor.poolId === query.poolId
    : cursor.scope === "position" && query.scope === "position" && cursor.tokenId === query.tokenId;
}

export function parseEventCursor(cursor: string | undefined, query: NormalizedEventQuery): number {
  if (!cursor) return 0;
  if (!/^v2:[A-Za-z0-9_-]+$/.test(cursor)) {
    throw eventError("UNISWAP_V4_EVENT_CURSOR_INVALID", "event cursor is malformed or stale");
  }
  try {
    const decoded = decodeCursor(
      JSON.parse(Buffer.from(cursor.slice(3), "base64url").toString("utf8"))
    );
    if (!decoded) {
      throw eventError("UNISWAP_V4_EVENT_CURSOR_INVALID", "event cursor payload is invalid");
    }
    if (!matchesQuery(decoded, query)) {
      throw eventError(
        "UNISWAP_V4_EVENT_CURSOR_MISMATCH",
        "event cursor does not match this query"
      );
    }
    if (!Number.isInteger(decoded.offset) || decoded.offset < 0) {
      throw eventError("UNISWAP_V4_EVENT_CURSOR_STALE", "event cursor offset is stale");
    }
    return decoded.offset;
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) throw error;
    throw eventError("UNISWAP_V4_EVENT_CURSOR_INVALID", "event cursor cannot be decoded");
  }
}

export function encodeEventCursor(query: NormalizedEventQuery, offset: number): string {
  const cursor: EventCursor =
    query.scope === "pool"
      ? {
          chainId: query.chainId,
          endBlockText: query.endBlockText,
          eventKinds: query.eventKinds,
          offset,
          order: CURSOR_ORDER,
          pageSize: query.pageSize,
          poolId: query.poolId,
          scope: "pool",
          startBlockText: query.startBlockText,
          version: CURSOR_VERSION,
        }
      : {
          chainId: query.chainId,
          endBlockText: query.endBlockText,
          eventKinds: query.eventKinds,
          offset,
          order: CURSOR_ORDER,
          pageSize: query.pageSize,
          scope: "position",
          startBlockText: query.startBlockText,
          tokenId: query.tokenId,
          version: CURSOR_VERSION,
        };
  return `v2:${Buffer.from(JSON.stringify(cursor)).toString("base64url")}`;
}
