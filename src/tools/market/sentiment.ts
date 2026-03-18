import type { SentimentResult } from "../../api/types.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "../shared/cache.js";

const SENTIMENT_TTL = 300_000;

interface FearGreedEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}

export async function getSentiment(input: { days?: number }): Promise<SentimentResult> {
  const days = input.days ?? 7;
  const url = `https://api.alternative.me/fng/?limit=${days}`;
  const data = await ttlCache(url, SENTIMENT_TTL, async () => {
    const res = await resilientFetch(url, undefined, { label: "fear-greed" });
    if (!res.ok) {
      throw new Error(`Fear & Greed API returned ${res.status}`);
    }
    return (await res.json()) as { data: FearGreedEntry[] };
  });
  const entries = data.data.map((d) => ({
    date: new Date(Number(d.timestamp) * 1000).toISOString(),
    value: Number(d.value),
    classification: d.value_classification,
  }));
  if (entries.length === 0) {
    throw new Error("Fear & Greed Index returned no data");
  }
  return {
    current: entries[0],
    history: entries,
  };
}
