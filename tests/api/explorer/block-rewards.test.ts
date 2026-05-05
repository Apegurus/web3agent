import { describe, expect, it } from "vitest";
import { normalizeEtherscanBlockRewards } from "../../../src/api/explorer/blocks.js";
import type { EtherscanBlock } from "../../../src/api/explorer/etherscan/types.js";

const baseBlock: EtherscanBlock = {
  blockNumber: "18000000",
  timeStamp: "1693958400",
  blockMiner: "0xminer123",
  blockReward: "2000000000000000000",
  uncleInclusionReward: "62500000000000000",
  uncles: [
    { miner: "0xuncle1", unclePosition: "0", blockreward: "1500000000000000000" },
    { miner: "0xuncle2", unclePosition: "1", blockreward: "1000000000000000000" },
  ],
};

describe("normalizeEtherscanBlockRewards", () => {
  it("maps block number", () => {
    const result = normalizeEtherscanBlockRewards(baseBlock);
    expect(result.blockNumber).toBe(18000000);
  });

  it("maps miner address", () => {
    const result = normalizeEtherscanBlockRewards(baseBlock);
    expect(result.miner).toBe("0xminer123");
  });

  it("maps block reward", () => {
    const result = normalizeEtherscanBlockRewards(baseBlock);
    expect(result.blockReward).toBe("2000000000000000000");
  });

  it("maps uncle inclusion reward", () => {
    const result = normalizeEtherscanBlockRewards(baseBlock);
    expect(result.uncleInclusionReward).toBe("62500000000000000");
  });

  it("maps uncle blocks", () => {
    const result = normalizeEtherscanBlockRewards(baseBlock);
    expect(result.uncles).toHaveLength(2);
    expect(result.uncles[0]).toMatchObject({
      miner: "0xuncle1",
      unclePosition: 0,
      blockreward: "1500000000000000000",
    });
    expect(result.uncles[1]).toMatchObject({
      miner: "0xuncle2",
      unclePosition: 1,
      blockreward: "1000000000000000000",
    });
  });

  it("handles empty uncles array", () => {
    const noUncles: EtherscanBlock = { ...baseBlock, uncles: [] };
    const result = normalizeEtherscanBlockRewards(noUncles);
    expect(result.uncles).toEqual([]);
  });
});
