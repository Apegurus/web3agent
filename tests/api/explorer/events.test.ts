import { describe, expect, it } from "vitest";
import type { EtherscanEventLog } from "../../../src/api/explorer/etherscan/types.js";
import { normalizeEtherscanEventLog } from "../../../src/api/explorer/events.js";

const baseLog: EtherscanEventLog = {
  address: "0xcontract123",
  topics: [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x000000000000000000000000sender",
    "0x000000000000000000000000receiver",
  ],
  data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
  blockNumber: "0x112a880",
  timeStamp: "0x6516c800",
  gasPrice: "0x3b9aca00",
  gasUsed: "0x5208",
  logIndex: "0x1a",
  transactionHash: "0xtxhash123",
  transactionIndex: "0x0",
};

describe("normalizeEtherscanEventLog", () => {
  it("maps address", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.address).toBe("0xcontract123");
  });

  it("maps topics array", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.topics).toHaveLength(3);
    expect(result.topics[0]).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    );
  });

  it("maps data", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.data).toBe("0x00000000000000000000000000000000000000000000000000000000000003e8");
  });

  it("converts hex blockNumber to number", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.blockNumber).toBe(0x112a880);
  });

  it("converts hex timestamp to ISO string", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("maps transaction hash", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.txHash).toBe("0xtxhash123");
  });

  it("converts hex logIndex to number", () => {
    const result = normalizeEtherscanEventLog(baseLog);
    expect(result.logIndex).toBe(0x1a);
  });

  it("handles empty topics array", () => {
    const emptyTopics: EtherscanEventLog = { ...baseLog, topics: [] };
    const result = normalizeEtherscanEventLog(emptyTopics);
    expect(result.topics).toEqual([]);
  });
});
