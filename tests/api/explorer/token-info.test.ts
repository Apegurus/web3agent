import { describe, expect, it } from "vitest";
import type {
  EtherscanTokenHolder,
  EtherscanTokenInfo,
} from "../../../src/api/explorer/etherscan/types.js";
import {
  normalizeEtherscanTokenHolders,
  normalizeEtherscanTokenInfo,
} from "../../../src/api/explorer/tokens.js";

const baseTokenInfo: EtherscanTokenInfo = {
  contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  tokenName: "Tether USD",
  symbol: "USDT",
  divisor: "6",
  tokenType: "ERC-20",
  totalSupply: "39828710009553080",
  blueCheckmark: "true",
  description: "Tether gives you the power of blockchain with the stability of fiat currency.",
  website: "https://tether.to",
  email: "support@tether.to",
  blog: "",
  reddit: "",
  slack: "",
  facebook: "",
  twitter: "https://twitter.com/Tether_to",
  bitcointalk: "",
  github: "https://github.com/tetherto",
  telegram: "https://t.me/OfficialTether",
  wechat: "",
  linkedin: "",
  discord: "https://discord.gg/tether",
  whitepaper: "",
  tokenPriceUSD: "1.00",
  tokenPriceETH: "0.000303",
};

describe("normalizeEtherscanTokenInfo", () => {
  it("maps basic token fields", () => {
    const result = normalizeEtherscanTokenInfo(baseTokenInfo);
    expect(result.contractAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
    expect(result.name).toBe("Tether USD");
    expect(result.symbol).toBe("USDT");
    expect(result.decimals).toBe(6);
    expect(result.totalSupply).toBe("39828710009553080");
    expect(result.tokenType).toBe("ERC-20");
  });

  it("maps website and description", () => {
    const result = normalizeEtherscanTokenInfo(baseTokenInfo);
    expect(result.website).toBe("https://tether.to");
    expect(result.description).toContain("Tether");
  });

  it("collects non-empty social profiles", () => {
    const result = normalizeEtherscanTokenInfo(baseTokenInfo);
    expect(result.socialProfiles).toBeDefined();
    expect(result.socialProfiles?.twitter).toBe("https://twitter.com/Tether_to");
    expect(result.socialProfiles?.github).toBe("https://github.com/tetherto");
    expect(result.socialProfiles?.telegram).toBe("https://t.me/OfficialTether");
    expect(result.socialProfiles?.discord).toBe("https://discord.gg/tether");
  });

  it("omits empty social profiles", () => {
    const result = normalizeEtherscanTokenInfo(baseTokenInfo);
    expect(result.socialProfiles?.reddit).toBeUndefined();
    expect(result.socialProfiles?.facebook).toBeUndefined();
    expect(result.socialProfiles?.blog).toBeUndefined();
  });

  it("omits socialProfiles when all are empty", () => {
    const noSocials: EtherscanTokenInfo = {
      ...baseTokenInfo,
      twitter: "",
      discord: "",
      telegram: "",
      github: "",
    };
    const result = normalizeEtherscanTokenInfo(noSocials);
    expect(result.socialProfiles).toBeUndefined();
  });

  it("omits website and description when empty", () => {
    const noWebsite: EtherscanTokenInfo = {
      ...baseTokenInfo,
      website: "",
      description: "",
    };
    const result = normalizeEtherscanTokenInfo(noWebsite);
    expect(result.website).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("handles invalid divisor gracefully", () => {
    const badDivisor: EtherscanTokenInfo = { ...baseTokenInfo, divisor: "" };
    const result = normalizeEtherscanTokenInfo(badDivisor);
    expect(result.decimals).toBe(0);
  });
});

const holders: EtherscanTokenHolder[] = [
  { TokenHolderAddress: "0xholder1", TokenHolderQuantity: "1000000000" },
  { TokenHolderAddress: "0xholder2", TokenHolderQuantity: "500000000" },
];

describe("normalizeEtherscanTokenHolders", () => {
  it("maps holder fields", () => {
    const result = normalizeEtherscanTokenHolders(holders);
    expect(result.holders).toHaveLength(2);
    expect(result.holders[0]).toMatchObject({
      address: "0xholder1",
      balance: "1000000000",
    });
    expect(result.holders[1]).toMatchObject({
      address: "0xholder2",
      balance: "500000000",
    });
  });

  it("sets hasMore based on pageSize", () => {
    const result = normalizeEtherscanTokenHolders(holders, 2);
    expect(result.hasMore).toBe(true);
  });

  it("sets hasMore false when fewer results than pageSize", () => {
    const result = normalizeEtherscanTokenHolders(holders, 10);
    expect(result.hasMore).toBe(false);
  });

  it("does not set hasMore when pageSize is undefined", () => {
    const result = normalizeEtherscanTokenHolders(holders);
    expect(result.hasMore).toBeUndefined();
  });

  it("handles empty array", () => {
    const result = normalizeEtherscanTokenHolders([]);
    expect(result.holders).toEqual([]);
  });
});
