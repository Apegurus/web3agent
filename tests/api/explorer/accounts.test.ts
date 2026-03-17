import { describe, expect, it } from "vitest";
import {
  normalizeBlockscoutAddress,
  normalizeBlockscoutTokens,
  normalizeEtherscanAddress,
} from "../../../src/api/explorer/accounts.js";
import type {
  BlockscoutAddress,
  BlockscoutToken,
} from "../../../src/api/explorer/blockscout/types.js";

describe("normalizeBlockscoutAddress", () => {
  const fullAddress: BlockscoutAddress = {
    hash: "0xabc123",
    coin_balance: "1000000000000000000",
    exchange_rate: "1800.50",
    is_contract: false,
    is_verified: false,
    name: null,
    ens_domain_name: "vitalik.eth",
    public_tags: [
      { label: "exchange", display_name: "Binance" },
      { label: "dex", display_name: "Uniswap" },
    ],
    has_tokens: true,
    has_token_transfers: true,
    implementations: [],
    proxy_type: null,
  };

  it("maps hash to address", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.address).toBe("0xabc123");
  });

  it("maps coin_balance to balance", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.balance).toBe("1000000000000000000");
  });

  it("uses '0' when coin_balance is null", () => {
    const raw: BlockscoutAddress = { ...fullAddress, coin_balance: null };
    const result = normalizeBlockscoutAddress(raw);
    expect(result.balance).toBe("0");
  });

  it("maps is_contract", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.isContract).toBe(false);
  });

  it("maps ens_domain_name to ensDomain", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.ensDomain).toBe("vitalik.eth");
  });

  it("omits ensDomain when ens_domain_name is null", () => {
    const raw: BlockscoutAddress = { ...fullAddress, ens_domain_name: null };
    const result = normalizeBlockscoutAddress(raw);
    expect(result.ensDomain).toBeUndefined();
  });

  it("maps public_tags display_name to tags array", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.tags).toEqual(["Binance", "Uniswap"]);
  });

  it("omits tags when public_tags is empty", () => {
    const raw: BlockscoutAddress = { ...fullAddress, public_tags: [] };
    const result = normalizeBlockscoutAddress(raw);
    expect(result.tags).toBeUndefined();
  });

  it("omits balanceUsd (exchange_rate is per-unit price, not total USD)", () => {
    const result = normalizeBlockscoutAddress(fullAddress);
    expect(result.balanceUsd).toBeUndefined();
  });

  it("handles contract address with name", () => {
    const raw: BlockscoutAddress = {
      ...fullAddress,
      is_contract: true,
      is_verified: true,
      name: "USDC Token",
    };
    const result = normalizeBlockscoutAddress(raw);
    expect(result.isContract).toBe(true);
    expect(result.isVerified).toBe(true);
    expect(result.name).toBe("USDC Token");
  });
});

describe("normalizeBlockscoutTokens", () => {
  const tokens: BlockscoutToken[] = [
    {
      address: "0xtoken1",
      symbol: "USDC",
      name: "USD Coin",
      decimals: "6",
      type: "ERC-20",
      balance: "1000000",
      exchange_rate: "1.00",
    },
    {
      address: "0xtoken2",
      symbol: null,
      name: null,
      decimals: null,
      type: "ERC-721",
      balance: "1",
      exchange_rate: null,
    },
  ];

  it("sets the address field", () => {
    const result = normalizeBlockscoutTokens("0xuser", tokens);
    expect(result.address).toBe("0xuser");
  });

  it("maps token fields correctly", () => {
    const result = normalizeBlockscoutTokens("0xuser", tokens);
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]).toMatchObject({
      contractAddress: "0xtoken1",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      balance: "1000000",
      type: "ERC-20",
    });
  });

  it("handles null symbol, name, decimals gracefully", () => {
    const result = normalizeBlockscoutTokens("0xuser", tokens);
    const t = result.tokens[1];
    expect(t.symbol).toBeUndefined();
    expect(t.name).toBeUndefined();
    expect(t.decimals).toBeUndefined();
    expect(t.balanceUsd).toBeUndefined();
  });

  it("returns empty tokens array for empty input", () => {
    const result = normalizeBlockscoutTokens("0xuser", []);
    expect(result.tokens).toEqual([]);
  });
});

describe("normalizeEtherscanAddress", () => {
  it("maps address and balance", () => {
    const result = normalizeEtherscanAddress("0xabc", "5000000000000000000");
    expect(result.address).toBe("0xabc");
    expect(result.balance).toBe("5000000000000000000");
  });

  it("sets isContract to false", () => {
    const result = normalizeEtherscanAddress("0xabc", "0");
    expect(result.isContract).toBe(false);
  });

  it("has no extra fields", () => {
    const result = normalizeEtherscanAddress("0xabc", "0");
    expect(result.ensDomain).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.name).toBeUndefined();
  });
});
