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

/** Maps metric name to Etherscan's value field name in the response */
const DAILY_STAT_VALUE_FIELDS: Record<string, string> = {
  dailyTxCount: "transactionCount",
  dailyGasUsed: "gasUsed",
  dailyNewAddresses: "newAddressCount",
  dailyBlockRewards: "blockRewards_Eth",
  networkUtilization: "networkUtilization",
};

export function normalizeEtherscanDailyStats(
  raw: Record<string, string>[],
  metric: string
): ExplorerDailyStats {
  const valueField = DAILY_STAT_VALUE_FIELDS[metric];
  return {
    stats: raw.map((item) => {
      const date = item.UTCDate ?? item.unixTimeStamp ?? "";
      // Use the explicit field mapping; fall back to first non-date field only if mapping is missing
      const value = valueField
        ? (item[valueField] ?? "")
        : (Object.entries(item).find(([k]) => k !== "UTCDate" && k !== "unixTimeStamp")?.[1] ?? "");
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
