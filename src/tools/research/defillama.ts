import type { z } from "zod";
import type {
  airdropEntrySchema,
  fundRaiseEntrySchema,
  governanceProposalEntrySchema,
  hackEntrySchema,
  newsEntrySchema,
  tokenUnlockEntrySchema,
  whaleTransferEntrySchema,
} from "../../api/schemas/outputs.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "../market/cache.js";

const TTL_SHORT = 60_000;
const TTL_LONG = 300_000;

// ── Types ─────────────────────────────────────────────────────────

export type TokenUnlockEntry = z.infer<typeof tokenUnlockEntrySchema>;
export type HackHistoryEntry = z.infer<typeof hackEntrySchema>;
export type FundRaiseEntry = z.infer<typeof fundRaiseEntrySchema>;
export type WhaleTransferEntry = z.infer<typeof whaleTransferEntrySchema>;
export type GovernanceEntry = z.infer<typeof governanceProposalEntrySchema>;
export type NewsEntry = z.infer<typeof newsEntrySchema>;
export type AirdropEntry = z.infer<typeof airdropEntrySchema>;

// ── Handlers ──────────────────────────────────────────────────────

export async function getTokenUnlocks(input: {
  limit?: number;
}): Promise<TokenUnlockEntry[]> {
  const { limit = 20 } = input;
  const data = await ttlCache("defillama:unlocks", TTL_SHORT, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/unlocks", undefined, {
      label: "defillama-unlocks",
    });
    return (await response.json()) as Array<{
      name: string;
      symbol: string;
      next_event: number;
      to_unlock_usd: number;
      price: number;
      delta_rel: number;
    }>;
  });

  return data.slice(0, limit).map((item) => ({
    name: item.name,
    symbol: item.symbol,
    nextEvent: new Date(item.next_event * 1000).toISOString(),
    toUnlockUsd: item.to_unlock_usd,
    price: item.price,
    priceImpactPercent: item.delta_rel,
  }));
}

export async function getHackHistory(input: {
  protocol?: string;
  limit?: number;
}): Promise<HackHistoryEntry[]> {
  const { protocol, limit = 20 } = input;
  const rawData = await ttlCache("defillama:hacks", TTL_LONG, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/hacks", undefined, {
      label: "defillama-hacks",
    });
    return response.json() as Promise<
      Array<{
        name: string;
        timestamp: number;
        amount: number;
        technique: string;
        source_url: string;
      }>
    >;
  });

  let filtered = rawData;

  if (protocol) {
    const lowerProtocol = protocol.toLowerCase();
    filtered = filtered.filter((item) => item.name.toLowerCase().includes(lowerProtocol));
  }

  return filtered.slice(0, limit).map((item) => ({
    name: item.name,
    date: new Date(item.timestamp * 1000).toISOString(),
    amountUsd: item.amount,
    technique: item.technique,
    sourceUrl: item.source_url,
  }));
}

export async function getFundRaises(input: {
  limit?: number;
}): Promise<FundRaiseEntry[]> {
  const { limit = 20 } = input;
  const data = await ttlCache("defillama:raises", TTL_LONG, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/raises", undefined, {
      label: "defillama-raises",
    });
    return (await response.json()) as Array<{
      name: string;
      timestamp: number;
      amount: number;
      round: string;
      lead_investor: string;
      source_url: string;
    }>;
  });

  return data.slice(0, limit).map((item) => ({
    name: item.name,
    date: new Date(item.timestamp * 1000).toISOString(),
    amountUsd: item.amount,
    round: item.round,
    leadInvestor: item.lead_investor,
    sourceUrl: item.source_url,
  }));
}

export async function getWhaleTransfers(input: {
  symbol?: string;
  limit?: number;
}): Promise<WhaleTransferEntry[]> {
  const { symbol, limit = 20 } = input;
  const rawData = await ttlCache("defillama:transfers", TTL_SHORT, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/transfers", undefined, {
      label: "defillama-transfers",
    });
    return response.json() as Promise<
      Array<{
        transaction_hash: string;
        block_time: string;
        symbol: string;
        value: number;
        value_usd: number;
        from_entity: string;
        to_entity: string;
      }>
    >;
  });

  let filtered = rawData;

  if (symbol) {
    const lowerSymbol = symbol.toLowerCase();
    filtered = filtered.filter((item) => item.symbol.toLowerCase() === lowerSymbol);
  }

  return filtered.slice(0, limit).map((item) => ({
    txHash: item.transaction_hash,
    blockTime: item.block_time,
    symbol: item.symbol,
    value: item.value,
    valueUsd: item.value_usd,
    fromEntity: item.from_entity,
    toEntity: item.to_entity,
  }));
}

export async function getGovernance(input: {
  protocol?: string;
  status?: string;
  limit?: number;
}): Promise<GovernanceEntry[]> {
  const { protocol, status, limit = 20 } = input;
  const rawData = await ttlCache("defillama:governance", TTL_LONG, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/governance", undefined, {
      label: "defillama-governance",
    });
    return response.json() as Promise<
      Array<{
        org_name: string;
        title: string;
        status: string;
        start: number;
        end: number;
        link: string;
        quorum: number;
        choices: string[];
        votes: number[];
        voters: number;
      }>
    >;
  });

  let filtered = rawData;

  if (protocol) {
    const lowerProtocol = protocol.toLowerCase();
    filtered = filtered.filter((item) => item.org_name.toLowerCase().includes(lowerProtocol));
  }

  if (status) {
    filtered = filtered.filter((item) => item.status === status);
  }

  return filtered.slice(0, limit).map((item) => ({
    orgName: item.org_name,
    title: item.title,
    status: item.status,
    startDate: new Date(item.start * 1000).toISOString(),
    endDate: new Date(item.end * 1000).toISOString(),
    link: item.link,
    quorum: item.quorum,
    choices: item.choices,
    votes: item.votes,
    voterCount: item.voters,
  }));
}

export async function getNews(input: {
  limit?: number;
}): Promise<NewsEntry[]> {
  const { limit = 20 } = input;
  const data = await ttlCache("defillama:news", TTL_SHORT, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/news", undefined, {
      label: "defillama-news",
    });
    return (await response.json()) as Array<{
      title: string;
      content: string;
      link: string;
      pub_date: string;
      topic: string;
      sentiment: string;
    }>;
  });

  return data.slice(0, limit).map((item) => ({
    title: item.title,
    summary: item.content,
    link: item.link,
    publishedAt: item.pub_date,
    topic: item.topic,
    sentiment: item.sentiment,
  }));
}

export async function getAirdrops(input: {
  limit?: number;
}): Promise<AirdropEntry[]> {
  const { limit = 20 } = input;
  const data = await ttlCache("defillama:airdrops", TTL_LONG, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/airdrops", undefined, {
      label: "defillama-airdrops",
    });
    return (await response.json()) as Array<{
      name: string;
      symbol: string;
      claim_page: string;
      ends: number | null;
      price: number;
      delta_rel: number;
    }>;
  });

  return data.slice(0, limit).map((item) => ({
    name: item.name,
    symbol: item.symbol,
    claimPage: item.claim_page,
    endsAt: item.ends !== null ? new Date(item.ends * 1000).toISOString() : null,
    price: item.price,
    priceChange: item.delta_rel,
  }));
}
