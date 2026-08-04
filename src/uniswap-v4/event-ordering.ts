import type { UniswapV4Event } from "../api/types.js";
import { encodeEventCursor } from "./event-cursor.js";
import type { NormalizedEventQuery } from "./event-query.js";
import type { UniswapV4EventPage } from "./event-types.js";

function compareEvents(left: UniswapV4Event, right: UniswapV4Event): number {
  const leftBlock = BigInt(left.blockNumber);
  const rightBlock = BigInt(right.blockNumber);
  if (leftBlock < rightBlock) return -1;
  if (leftBlock > rightBlock) return 1;
  if (left.transactionIndex !== right.transactionIndex)
    return left.transactionIndex - right.transactionIndex;
  return left.logIndex - right.logIndex;
}

export function pageOrderedEvents(
  events: readonly UniswapV4Event[],
  query: NormalizedEventQuery,
  offset: number
): UniswapV4EventPage | undefined {
  const kinds = new Set(query.eventKinds);
  const matching = [...events]
    .sort(compareEvents)
    .filter((event) => kinds.size === 0 || kinds.has(event.kind));
  if (offset > matching.length) return undefined;
  const pageEvents = matching.slice(offset, offset + query.pageSize);
  const nextOffset = offset + pageEvents.length;
  const hasMore = nextOffset < matching.length;
  return {
    events: pageEvents,
    hasMore,
    ...(hasMore ? { nextCursor: encodeEventCursor(query, nextOffset) } : {}),
  };
}
