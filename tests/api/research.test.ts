import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  invokeTool: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn().mockResolvedValue({
    invokeTool: (...args: unknown[]) => runtimeMocks.invokeTool(...args),
  }),
}));

function makeSuccessResult(data: unknown) {
  return {
    isError: false,
    structuredContent: { ok: true, data },
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

describe("research SDK functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getContractSecurity calls research_contract_security with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ score: 95, issues: [] }));
    const { getContractSecurity } = await import("../../src/api/research.js");
    const result = await getContractSecurity({ address: "0xabc", chainId: 1 });
    expect(result).toEqual({ score: 95, issues: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_contract_security", {
      address: "0xabc",
      chainId: 1,
    });
  });

  it("getTokenDueDiligence calls research_token_due_diligence with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ token: "ETH", risk: "low" }));
    const { getTokenDueDiligence } = await import("../../src/api/research.js");
    const result = await getTokenDueDiligence({ token: "ETH", chainId: 1 });
    expect(result).toEqual({ token: "ETH", risk: "low" });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_token_due_diligence", {
      token: "ETH",
      chainId: 1,
    });
  });

  it("getTokenHolders calls research_token_holders with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ holders: [] }));
    const { getTokenHolders } = await import("../../src/api/research.js");
    const result = await getTokenHolders({ token: "0xtoken", chainId: 1, limit: 10 });
    expect(result).toEqual({ holders: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_token_holders", {
      token: "0xtoken",
      chainId: 1,
      limit: 10,
    });
  });

  it("getYieldOpportunities calls research_yield_opportunities with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ opportunities: [] }));
    const { getYieldOpportunities } = await import("../../src/api/research.js");
    const result = await getYieldOpportunities({ token: "USDC", chain: "Ethereum", limit: 5 });
    expect(result).toEqual({ opportunities: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_yield_opportunities", {
      token: "USDC",
      chain: "Ethereum",
      limit: 5,
    });
  });

  it("getCompareYields calls research_compare_yields with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ yields: [] }));
    const { getCompareYields } = await import("../../src/api/research.js");
    const result = await getCompareYields({ token: "DAI", chainId: 1, limit: 10 });
    expect(result).toEqual({ yields: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_compare_yields", {
      token: "DAI",
      chainId: 1,
      limit: 10,
    });
  });

  it("getProtocolInfo calls research_protocol_info with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(
      makeSuccessResult({ name: "Aave", tvl: 5000000000 })
    );
    const { getProtocolInfo } = await import("../../src/api/research.js");
    const result = await getProtocolInfo({ protocol: "aave" });
    expect(result).toEqual({ name: "Aave", tvl: 5000000000 });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_protocol_info", {
      protocol: "aave",
    });
  });

  it("getTokenUnlocks calls research_token_unlocks with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ unlocks: [] }));
    const { getTokenUnlocks } = await import("../../src/api/research.js");
    const result = await getTokenUnlocks({ limit: 20 });
    expect(result).toEqual({ unlocks: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_token_unlocks", {
      limit: 20,
    });
  });

  it("getHackHistory calls research_hack_history with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ hacks: [] }));
    const { getHackHistory } = await import("../../src/api/research.js");
    const result = await getHackHistory({ protocol: "compound", limit: 10 });
    expect(result).toEqual({ hacks: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_hack_history", {
      protocol: "compound",
      limit: 10,
    });
  });

  it("getFundRaises calls research_fund_raises with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ raises: [] }));
    const { getFundRaises } = await import("../../src/api/research.js");
    const result = await getFundRaises({ limit: 15 });
    expect(result).toEqual({ raises: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_fund_raises", {
      limit: 15,
    });
  });

  it("getWhaleTransfers calls research_whale_transfers with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ transfers: [] }));
    const { getWhaleTransfers } = await import("../../src/api/research.js");
    const result = await getWhaleTransfers({ symbol: "ETH", limit: 25 });
    expect(result).toEqual({ transfers: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_whale_transfers", {
      symbol: "ETH",
      limit: 25,
    });
  });

  it("getGovernance calls research_governance with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ proposals: [] }));
    const { getGovernance } = await import("../../src/api/research.js");
    const result = await getGovernance({ protocol: "uniswap", status: "active", limit: 10 });
    expect(result).toEqual({ proposals: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_governance", {
      protocol: "uniswap",
      status: "active",
      limit: 10,
    });
  });

  it("getNews calls research_news with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ articles: [] }));
    const { getNews } = await import("../../src/api/research.js");
    const result = await getNews({ limit: 10 });
    expect(result).toEqual({ articles: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_news", {
      limit: 10,
    });
  });

  it("getAirdrops calls research_airdrops with correct params", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce(makeSuccessResult({ airdrops: [] }));
    const { getAirdrops } = await import("../../src/api/research.js");
    const result = await getAirdrops({ limit: 10 });
    expect(result).toEqual({ airdrops: [] });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("research_airdrops", {
      limit: 10,
    });
  });
});
