import type {
  ExplorerDailyStats,
  ExplorerHistoricalPrice,
  ExplorerNativePrice,
  ExplorerNativeSupply,
} from "../types.js";
import type {
  EtherscanHistoricalPrice,
  EtherscanPrice,
  EtherscanSupply,
} from "./etherscan/types.js";

export function normalizeEtherscanDailyStats(
  raw: Record<string, string>[],
  metric: string
): ExplorerDailyStats {
  return {
    stats: raw.map((item) => {
      const date = item.UTCDate ?? item.unixTimeStamp ?? Object.values(item)[0];
      const value =
        Object.entries(item).find(([k]) => k !== "UTCDate" && k !== "unixTimeStamp")?.[1] ?? "";
      return { date, value };
    }),
    metric,
  };
}

export function normalizeEtherscanNativePrice(raw: EtherscanPrice): ExplorerNativePrice {
  return {
    priceUsd: raw.ethusd,
    priceBtc: raw.ethbtc,
    timestamp: new Date(Number(raw.ethusd_timestamp) * 1000).toISOString(),
  };
}

export function normalizeEtherscanHistoricalPrice(
  raw: EtherscanHistoricalPrice[]
): ExplorerHistoricalPrice {
  return {
    prices: raw.map((item) => ({
      date: item.UTCDate,
      priceUsd: item.value,
    })),
  };
}

export function normalizeEtherscanNativeSupply(raw: EtherscanSupply): ExplorerNativeSupply {
  return {
    totalSupply: raw.EthSupply,
    stakedAmount: raw.Eth2Staking || undefined,
    burnedFees: raw.BurntFees || undefined,
    withdrawnTotal: raw.WithdrawnTotal || undefined,
  };
}
