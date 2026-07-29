import { toEventSelector } from "viem";

import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4Event, UniswapV4EventQuery } from "../api/types.js";
import { getPublicClientCached } from "../evm/services.js";
import {
  UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
  UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
} from "./abis.js";
import { getUniswapV4Deployment } from "./deployments.js";
import { parseEventCursor } from "./event-cursor.js";
import {
  decodePoolManagerEvent,
  decodePositionManagerPoolEvent,
  decodePositionManagerTransfer,
} from "./event-decoding.js";
import { pageOrderedEvents } from "./event-ordering.js";
import { normalizeEventQuery } from "./event-query.js";
import type { NormalizedEventQuery } from "./event-query.js";
import type {
  UniswapV4EventLog,
  UniswapV4EventPage,
  UniswapV4EventPageOptions,
  UniswapV4EventTransport,
} from "./event-types.js";

export type {
  UniswapV4EventLog,
  UniswapV4EventPage,
  UniswapV4EventTransport,
} from "./event-types.js";

function eventError(code: string, message: string, cause?: unknown): Web3AgentError {
  return new Web3AgentError({ cause, code, message });
}

function eventTopics(topics: readonly `0x${string}`[]): [`0x${string}`, ...`0x${string}`[]] {
  const [signature, ...args] = topics;
  if (!signature)
    throw eventError("UNISWAP_V4_EVENT_LOG_MALFORMED", "event log is missing its signature topic");
  return [signature, ...args];
}

function defaultTransport(chainId: number): UniswapV4EventTransport {
  const client = getPublicClientCached(chainId);
  return {
    getChainId: () => client.getChainId(),
    getLogs: async ({ address, events, fromBlock, toBlock }) =>
      client
        .getLogs({ address, events, fromBlock, toBlock })
        .then((logs) => logs.map((log) => ({ ...log, topics: eventTopics(log.topics) }))),
  };
}

async function fetchLogs(
  transport: UniswapV4EventTransport,
  address: `0x${string}`,
  query: NormalizedEventQuery,
  events: NonNullable<Parameters<UniswapV4EventTransport["getLogs"]>[0]["events"]>
): Promise<readonly UniswapV4EventLog[]> {
  try {
    const selectors = new Set(events.map((event) => toEventSelector(event)));
    const logs = await transport.getLogs({
      address,
      events,
      fromBlock: query.startBlock,
      toBlock: query.endBlock,
    });
    return logs.filter((log) => selectors.has(log.topics[0]));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown RPC error";
    const code = /limit|too many|range/i.test(message)
      ? "UNISWAP_V4_EVENT_RPC_LIMIT"
      : "UNISWAP_V4_EVENT_RPC_FAILED";
    throw eventError(code, `event log query failed: ${message}`, error);
  }
}

function poolEvents(
  poolLogs: readonly UniswapV4EventLog[],
  positionLogs: readonly UniswapV4EventLog[],
  poolId: string
): readonly UniswapV4Event[] {
  const decoded = [
    ...poolLogs.map(decodePoolManagerEvent),
    ...positionLogs.map(decodePositionManagerPoolEvent),
  ].filter((event): event is UniswapV4Event => event !== undefined);
  return decoded.filter(
    (event) =>
      event.poolAssociation.kind === "associated" &&
      event.poolAssociation.poolId.toLowerCase() === poolId
  );
}

function positionEvents(
  logs: readonly UniswapV4EventLog[],
  tokenId: string
): readonly UniswapV4Event[] {
  return logs
    .map(decodePositionManagerTransfer)
    .filter((event): event is UniswapV4Event => event !== undefined)
    .filter(
      (
        event
      ): event is Extract<
        UniswapV4Event,
        { readonly poolAssociation: { readonly kind: "unassociated" } }
      > => event.poolAssociation.kind === "unassociated"
    )
    .filter((event) => event.tokenId === tokenId);
}

async function loadEvents(
  query: NormalizedEventQuery,
  transport: UniswapV4EventTransport,
  addresses: { readonly poolManager: `0x${string}`; readonly positionManager: `0x${string}` }
): Promise<readonly UniswapV4Event[]> {
  if (query.scope === "position")
    return positionEvents(
      await fetchLogs(transport, addresses.positionManager, query, [
        UNISWAP_V4_POSITION_MANAGER_EVENT_ABI[0],
      ]),
      query.tokenId
    );
  const [poolLogs, positionLogs] = await Promise.all([
    fetchLogs(transport, addresses.poolManager, query, UNISWAP_V4_POOL_MANAGER_EVENT_ABI),
    fetchLogs(transport, addresses.positionManager, query, [
      UNISWAP_V4_POSITION_MANAGER_EVENT_ABI[1],
    ]),
  ]);
  return poolEvents(poolLogs, positionLogs, query.poolId);
}

export async function getUniswapV4EventPage(
  queryInput: UniswapV4EventQuery,
  options: UniswapV4EventPageOptions = {}
): Promise<UniswapV4EventPage> {
  const query = normalizeEventQuery(queryInput);
  const offset = parseEventCursor(queryInput.cursor, query);
  const deployment = options.deployment ?? getUniswapV4Deployment(query.chainId);
  if (deployment.chainId !== query.chainId)
    throw eventError(
      "UNISWAP_V4_DEPLOYMENT_CHAIN_MISMATCH",
      "injected deployment belongs to another chain"
    );
  const transport = options.transport ?? defaultTransport(query.chainId);
  if ((await transport.getChainId()) !== query.chainId)
    throw eventError("UNISWAP_V4_CHAIN_MISMATCH", "RPC chain does not match the event query chain");
  const events = await loadEvents(query, transport, deployment);
  const page = pageOrderedEvents(events, query, offset);
  if (!page)
    throw eventError(
      "UNISWAP_V4_EVENT_CURSOR_STALE",
      "event cursor offset exceeds the matching event sequence"
    );
  return page;
}
