import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("../../../src/tools/market/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

const mockResolveToken = vi.hoisted(() => vi.fn());
vi.mock("../../../src/tokens/resolver.js", () => ({
  resolveToken: mockResolveToken,
}));

import {
  getContractSecurity,
  getTokenDueDiligence,
  getTokenHolders,
} from "../../../src/tools/research/security.js";

beforeEach(() => {
  mockResilientFetch.mockReset();
  mockResolveToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getContractSecurity ───────────────────────────────────────────

const MOCK_CONTRACT_ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";

const mockGoPlusContractResponse = {
  result: {
    [MOCK_CONTRACT_ADDRESS.toLowerCase()]: {
      is_open_source: "1",
      is_proxy: "0",
      owner_address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      is_mintable: "0",
      can_take_back_ownership: "0",
      is_honeypot: "0",
      owner_change_balance: "0",
      is_blacklisted: "0",
      is_whitelisted: "0",
      is_anti_whale: "0",
    },
  },
};

describe("getContractSecurity", () => {
  it("returns contract security data for a verified contract", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusContractResponse), { status: 200 })
    );

    const result = await getContractSecurity({ address: MOCK_CONTRACT_ADDRESS, chainId: 1 });

    expect(result.verified).toBe(true);
    expect(result.isProxy).toBe(false);
    expect(result.ownerAddress).toBe("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(result.isHoneypot).toBe(false);
    expect(result.maliciousFlags).toEqual([]);
  });

  it("calls GoPlus API with correct URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusContractResponse), { status: 200 })
    );

    await getContractSecurity({ address: MOCK_CONTRACT_ADDRESS, chainId: 1 });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      `https://api.gopluslabs.io/api/v1/contract_security/1?contract_addresses=${MOCK_CONTRACT_ADDRESS}`,
      undefined,
      expect.objectContaining({ label: "goplus" })
    );
  });

  it("returns maliciousFlags when issues are detected", async () => {
    const response = {
      result: {
        [MOCK_CONTRACT_ADDRESS.toLowerCase()]: {
          is_open_source: "0",
          is_proxy: "0",
          owner_address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          is_honeypot: "1",
          is_blacklisted: "1",
        },
      },
    };

    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 })
    );

    const result = await getContractSecurity({ address: MOCK_CONTRACT_ADDRESS, chainId: 1 });

    expect(result.verified).toBe(false);
    expect(result.isHoneypot).toBe(true);
    expect(result.maliciousFlags).toContain("honeypot");
    expect(result.maliciousFlags).toContain("unverified_source");
  });

  it("uses default chainId 1 (Ethereum) when not provided", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusContractResponse), { status: 200 })
    );

    await getContractSecurity({ address: MOCK_CONTRACT_ADDRESS });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("/contract_security/1?"),
      undefined,
      expect.anything()
    );
  });

  it("throws when address data is not found in response", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: {} }), { status: 200 })
    );

    await expect(
      getContractSecurity({ address: MOCK_CONTRACT_ADDRESS, chainId: 1 })
    ).rejects.toThrow();
  });
});

// ── getTokenDueDiligence ──────────────────────────────────────────

const MOCK_TOKEN_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

const mockGoPlusTokenResponse = {
  result: {
    [MOCK_TOKEN_ADDRESS.toLowerCase()]: {
      is_honeypot: "0",
      buy_tax: "0.01",
      sell_tax: "0.01",
      holder_count: "5000",
      lp_holder_count: "200",
      is_open_source: "1",
      creator_address: "0xcreator0000000000000000000000000000000000",
    },
  },
};

const mockDexScreenerResponse = {
  pairs: [
    {
      pairAddress: "0xpair000000000000000000000000000000000000",
      baseToken: { address: MOCK_TOKEN_ADDRESS, name: "Test Token", symbol: "TEST" },
      quoteToken: { address: "0xusdc", name: "USD Coin", symbol: "USDC" },
      liquidity: { usd: 500000 },
      pairCreatedAt: 1700000000000,
      fdv: 1000000,
    },
  ],
};

describe("getTokenDueDiligence", () => {
  it("returns merged due diligence data from all sources", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockGoPlusTokenResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDexScreenerResponse), { status: 200 })
      );

    const result = await getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result.isHoneypot).toBe(false);
    expect(result.buyTax).toBe(0.01);
    expect(result.sellTax).toBe(0.01);
    expect(result.holderCount).toBe(5000);
    expect(result.liquidityUsd).toBe(500000);
    expect(result.createdAt).toBeDefined();
    expect(result.riskLevel).toBe("low");
    expect(result.warnings).toEqual([]);
    expect(result.sources).toContain("goplus");
    expect(result.sources).toContain("dexscreener");
  });

  it("returns partial result with warning when one source fails", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockGoPlusTokenResponse), { status: 200 }))
      .mockRejectedValueOnce(new Error("DexScreener unreachable"));

    const result = await getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result.isHoneypot).toBe(false);
    expect(result.holderCount).toBe(5000);
    expect(result.warnings).toContain("dexscreener");
    expect(result.sources).toContain("goplus");
    expect(result.sources).not.toContain("dexscreener");
  });

  it("resolves token symbol via resolveToken when no 0x prefix", async () => {
    mockResolveToken.mockResolvedValueOnce({
      address: MOCK_TOKEN_ADDRESS,
      symbol: "TEST",
      name: "Test Token",
      decimals: 18,
      chainId: 1,
      source: "registry",
    });

    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockGoPlusTokenResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDexScreenerResponse), { status: 200 })
      );

    const result = await getTokenDueDiligence({ token: "TEST", chainId: 1 });

    expect(mockResolveToken).toHaveBeenCalledWith("TEST", 1);
    expect(result.isHoneypot).toBe(false);
  });

  it("throws when symbol cannot be resolved", async () => {
    mockResolveToken.mockResolvedValueOnce(null);

    await expect(getTokenDueDiligence({ token: "UNKNOWN_TOKEN", chainId: 1 })).rejects.toThrow();
  });

  it("sets riskLevel to high when isHoneypot is true", async () => {
    const honeypotResponse = {
      result: {
        [MOCK_TOKEN_ADDRESS.toLowerCase()]: {
          is_honeypot: "1",
          buy_tax: "0",
          sell_tax: "0",
          holder_count: "100",
        },
      },
    };

    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(honeypotResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDexScreenerResponse), { status: 200 })
      );

    const result = await getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result.riskLevel).toBe("high");
    expect(result.isHoneypot).toBe(true);
  });

  it("sets riskLevel to high when buy/sell tax > 10%", async () => {
    const highTaxResponse = {
      result: {
        [MOCK_TOKEN_ADDRESS.toLowerCase()]: {
          is_honeypot: "0",
          buy_tax: "0.15",
          sell_tax: "0.05",
          holder_count: "1000",
        },
      },
    };

    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(highTaxResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDexScreenerResponse), { status: 200 })
      );

    const result = await getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result.riskLevel).toBe("high");
  });

  it("sets riskLevel to medium when liquidity is low", async () => {
    const lowLiquidityDexResponse = {
      pairs: [
        {
          ...mockDexScreenerResponse.pairs[0],
          liquidity: { usd: 5000 },
        },
      ],
    };

    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockGoPlusTokenResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(lowLiquidityDexResponse), { status: 200 })
      );

    const result = await getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result.riskLevel).toBe("medium");
  });

  it("throws when all sources fail", async () => {
    mockResilientFetch
      .mockRejectedValueOnce(new Error("GoPlus unreachable"))
      .mockRejectedValueOnce(new Error("DexScreener unreachable"));

    await expect(getTokenDueDiligence({ token: MOCK_TOKEN_ADDRESS, chainId: 1 })).rejects.toThrow();
  });
});

// ── getTokenHolders ───────────────────────────────────────────────

const mockGoPlusHoldersResponse = {
  result: {
    [MOCK_TOKEN_ADDRESS.toLowerCase()]: {
      holders: [
        {
          address: "0xholder1000000000000000000000000000000001",
          balance: "1000000000000000000000",
          percent: "0.1",
          is_contract: "0",
          tag: "Binance",
        },
        {
          address: "0xholder2000000000000000000000000000000002",
          balance: "500000000000000000000",
          percent: "0.05",
          is_contract: "1",
          tag: "",
        },
      ],
    },
  },
};

describe("getTokenHolders", () => {
  it("returns holder data mapped to camelCase fields", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusHoldersResponse), { status: 200 })
    );

    const result = await getTokenHolders({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      address: "0xholder1000000000000000000000000000000001",
      balance: "1000000000000000000000",
      percentOfSupply: 0.1,
      label: "Binance",
    });
    expect(result[1]).toEqual({
      address: "0xholder2000000000000000000000000000000002",
      balance: "500000000000000000000",
      percentOfSupply: 0.05,
      label: null,
    });
  });

  it("respects limit parameter", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusHoldersResponse), { status: 200 })
    );

    const result = await getTokenHolders({ token: MOCK_TOKEN_ADDRESS, chainId: 1, limit: 1 });

    expect(result).toHaveLength(1);
  });

  it("uses default limit of 10 when not provided", async () => {
    const manyHolders = Array.from({ length: 15 }, (_, i) => ({
      address: `0xholder${String(i).padStart(40, "0")}`,
      balance: "100",
      percent: "0.01",
      is_contract: "0",
      tag: "",
    }));

    const response = {
      result: {
        [MOCK_TOKEN_ADDRESS.toLowerCase()]: {
          holders: manyHolders,
        },
      },
    };

    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 })
    );

    const result = await getTokenHolders({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(result).toHaveLength(10);
  });

  it("calls GoPlus API with correct URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockGoPlusHoldersResponse), { status: 200 })
    );

    await getTokenHolders({ token: MOCK_TOKEN_ADDRESS, chainId: 1 });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${MOCK_TOKEN_ADDRESS}`,
      undefined,
      expect.objectContaining({ label: "goplus" })
    );
  });

  it("throws when token data is not found in response", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: {} }), { status: 200 })
    );

    await expect(getTokenHolders({ token: MOCK_TOKEN_ADDRESS, chainId: 1 })).rejects.toThrow();
  });
});
