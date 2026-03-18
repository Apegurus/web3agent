import { describe, expect, it } from "vitest";
import type {
  EtherscanHistoricalPrice,
  EtherscanPrice,
  EtherscanSupply,
} from "../../../src/api/explorer/etherscan/types.js";
import {
  normalizeEtherscanDailyStats,
  normalizeEtherscanHistoricalPrice,
  normalizeEtherscanNativePrice,
  normalizeEtherscanNativeSupply,
} from "../../../src/api/explorer/network.js";

describe("normalizeEtherscanDailyStats", () => {
  it("maps UTCDate and value fields", () => {
    const raw = [
      { UTCDate: "2024-01-01", transactionCount: "1234567" },
      { UTCDate: "2024-01-02", transactionCount: "2345678" },
    ];
    const result = normalizeEtherscanDailyStats(raw, "dailyTxCount");
    expect(result.metric).toBe("dailyTxCount");
    expect(result.stats).toHaveLength(2);
    expect(result.stats[0].date).toBe("2024-01-01");
    expect(result.stats[0].value).toBe("1234567");
  });

  it("handles different value field names", () => {
    const raw = [{ UTCDate: "2024-01-01", gasUsed: "9876543" }];
    const result = normalizeEtherscanDailyStats(raw, "dailyGasUsed");
    expect(result.stats[0].value).toBe("9876543");
  });

  it("handles empty array", () => {
    const result = normalizeEtherscanDailyStats([], "dailyTxCount");
    expect(result.stats).toEqual([]);
    expect(result.metric).toBe("dailyTxCount");
  });

  it("falls back to first value when no UTCDate", () => {
    const raw = [{ unixTimeStamp: "1704067200", value: "42" }];
    const result = normalizeEtherscanDailyStats(raw, "test");
    expect(result.stats[0].date).toBe("1704067200");
    expect(result.stats[0].value).toBe("42");
  });
});

describe("normalizeEtherscanNativePrice", () => {
  const basePrice: EtherscanPrice = {
    ethbtc: "0.05432",
    ethbtc_timestamp: "1704067200",
    ethusd: "2345.67",
    ethusd_timestamp: "1704067200",
  };

  it("maps USD price", () => {
    const result = normalizeEtherscanNativePrice(basePrice);
    expect(result.priceUsd).toBe("2345.67");
  });

  it("maps BTC price", () => {
    const result = normalizeEtherscanNativePrice(basePrice);
    expect(result.priceBtc).toBe("0.05432");
  });

  it("converts timestamp to ISO string", () => {
    const result = normalizeEtherscanNativePrice(basePrice);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("normalizeEtherscanHistoricalPrice", () => {
  it("maps price entries", () => {
    const raw: EtherscanHistoricalPrice[] = [
      { UTCDate: "2024-01-01", value: "2300.50" },
      { UTCDate: "2024-01-02", value: "2400.75" },
    ];
    const result = normalizeEtherscanHistoricalPrice(raw);
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].date).toBe("2024-01-01");
    expect(result.prices[0].priceUsd).toBe("2300.50");
  });

  it("handles empty array", () => {
    const result = normalizeEtherscanHistoricalPrice([]);
    expect(result.prices).toEqual([]);
  });
});

describe("normalizeEtherscanNativeSupply", () => {
  const baseSupply: EtherscanSupply = {
    EthSupply: "120000000000000000000000000",
    Eth2Staking: "30000000000000000000000000",
    BurntFees: "5000000000000000000000000",
    WithdrawnTotal: "2000000000000000000000000",
  };

  it("maps total supply", () => {
    const result = normalizeEtherscanNativeSupply(baseSupply);
    expect(result.totalSupply).toBe("120000000000000000000000000");
  });

  it("maps staked amount", () => {
    const result = normalizeEtherscanNativeSupply(baseSupply);
    expect(result.stakedAmount).toBe("30000000000000000000000000");
  });

  it("maps burned fees", () => {
    const result = normalizeEtherscanNativeSupply(baseSupply);
    expect(result.burnedFees).toBe("5000000000000000000000000");
  });

  it("maps withdrawn total", () => {
    const result = normalizeEtherscanNativeSupply(baseSupply);
    expect(result.withdrawnTotal).toBe("2000000000000000000000000");
  });

  it("returns undefined for empty optional fields", () => {
    const minimal: EtherscanSupply = {
      EthSupply: "100",
      Eth2Staking: "",
      BurntFees: "",
      WithdrawnTotal: "",
    };
    const result = normalizeEtherscanNativeSupply(minimal);
    expect(result.totalSupply).toBe("100");
    expect(result.stakedAmount).toBeUndefined();
    expect(result.burnedFees).toBeUndefined();
    expect(result.withdrawnTotal).toBeUndefined();
  });
});
