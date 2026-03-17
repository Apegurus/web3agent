import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "./cache.js";

const SENTIMENT_TTL = 300_000;

interface FearGreedEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}

export async function getSentiment(input: { days?: number }) {
  const days = input.days ?? 7;
  const url = `https://api.alternative.me/fng/?limit=${days}`;
  const data = await ttlCache(url, SENTIMENT_TTL, async () => {
    const res = await resilientFetch(url, undefined, { label: "fear-greed" });
    return (await res.json()) as { data: FearGreedEntry[] };
  });
  const entries = data.data.map((d) => ({
    date: new Date(Number(d.timestamp) * 1000).toISOString(),
    value: Number(d.value),
    classification: d.value_classification,
  }));
  return {
    current: entries[0],
    history: entries,
  };
}
