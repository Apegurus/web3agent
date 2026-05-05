import { describe, expect, it } from "vitest";
import { normalizeBlockscoutBlock } from "../../../src/api/explorer/blocks.js";
import type { BlockscoutBlock } from "../../../src/api/explorer/blockscout/types.js";

const baseBlock: BlockscoutBlock = {
  height: 19000000,
  hash: "0xblockhash",
  timestamp: "2024-01-15T12:00:00.000Z",
  parent_hash: "0xparenthash",
  miner: { hash: "0xminer" },
  gas_used: "12345678",
  gas_limit: "30000000",
  base_fee_per_gas: "15000000000",
  tx_count: 120,
  rewards: [
    { type: "miner_reward", value: "2000000000000000000" },
    { type: "uncle_inclusion", value: "62500000000000000" },
  ],
};

describe("normalizeBlockscoutBlock", () => {
  it("maps height to number", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.number).toBe(19000000);
  });

  it("maps hash and parentHash", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.hash).toBe("0xblockhash");
    expect(result.parentHash).toBe("0xparenthash");
  });

  it("maps timestamp", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.timestamp).toBe("2024-01-15T12:00:00.000Z");
  });

  it("maps miner.hash to miner", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.miner).toBe("0xminer");
  });

  it("maps gasUsed and gasLimit", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.gasUsed).toBe("12345678");
    expect(result.gasLimit).toBe("30000000");
  });

  it("maps base_fee_per_gas to baseFeePerGas", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.baseFeePerGas).toBe("15000000000");
  });

  it("omits baseFeePerGas when null", () => {
    const raw: BlockscoutBlock = { ...baseBlock, base_fee_per_gas: null };
    const result = normalizeBlockscoutBlock(raw);
    expect(result.baseFeePerGas).toBeUndefined();
  });

  it("maps tx_count to txCount", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    expect(result.txCount).toBe(120);
  });

  it("sums rewards values", () => {
    const result = normalizeBlockscoutBlock(baseBlock);
    // 2000000000000000000 + 62500000000000000 = 2062500000000000000
    expect(result.reward).toBe("2062500000000000000");
  });

  it("omits reward when rewards is null", () => {
    const raw: BlockscoutBlock = { ...baseBlock, rewards: null };
    const result = normalizeBlockscoutBlock(raw);
    expect(result.reward).toBeUndefined();
  });

  it("omits reward when rewards is empty array", () => {
    const raw: BlockscoutBlock = { ...baseBlock, rewards: [] };
    const result = normalizeBlockscoutBlock(raw);
    expect(result.reward).toBeUndefined();
  });

  it("handles single reward", () => {
    const raw: BlockscoutBlock = {
      ...baseBlock,
      rewards: [{ type: "miner_reward", value: "3000000000000000000" }],
    };
    const result = normalizeBlockscoutBlock(raw);
    expect(result.reward).toBe("3000000000000000000");
  });
});
