import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
}));

import {
  getAirdrops,
  getCompareYields,
  getContractSecurity,
  getFundRaises,
  getGovernance,
  getHackHistory,
  getNews,
  getProtocolInfo,
  getTokenDueDiligence,
  getTokenHolders,
  getTokenUnlocks,
  getWhaleTransfers,
  getYieldOpportunities,
} from "../../src/api/research.js";
import { getRuntime, invokeAndRequireData } from "../../src/api/shared.js";

describe("research SDK functions", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock runtime has no typed interface
  const mockRuntime = {} as any;

  beforeEach(() => {
    vi.mocked(getRuntime).mockResolvedValue(mockRuntime);
    vi.mocked(invokeAndRequireData).mockResolvedValue({ data: "test" });
  });

  it("getContractSecurity invokes correct tool", async () => {
    await getContractSecurity({ address: "0xabc", chainId: 1 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_contract_security", {
      address: "0xabc",
      chainId: 1,
    });
  });

  it("getTokenDueDiligence invokes correct tool", async () => {
    await getTokenDueDiligence({ token: "ETH", chainId: 1 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_token_due_diligence", {
      token: "ETH",
      chainId: 1,
    });
  });

  it("getTokenHolders invokes correct tool", async () => {
    await getTokenHolders({ token: "0xtoken", chainId: 1, limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_token_holders", {
      token: "0xtoken",
      chainId: 1,
      limit: 10,
    });
  });

  it("getYieldOpportunities invokes correct tool", async () => {
    await getYieldOpportunities({ token: "USDC", chain: "Ethereum", limit: 5 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_yield_opportunities", {
      token: "USDC",
      chain: "Ethereum",
      limit: 5,
    });
  });

  it("getCompareYields invokes correct tool", async () => {
    await getCompareYields({ token: "DAI", chainId: 1, limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_compare_yields", {
      token: "DAI",
      chainId: 1,
      limit: 10,
    });
  });

  it("getProtocolInfo invokes correct tool", async () => {
    await getProtocolInfo({ protocol: "aave" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_protocol_info", {
      protocol: "aave",
    });
  });

  it("getTokenUnlocks invokes correct tool", async () => {
    await getTokenUnlocks({ limit: 20 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_token_unlocks", {
      limit: 20,
    });
  });

  it("getHackHistory invokes correct tool", async () => {
    await getHackHistory({ protocol: "compound", limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_hack_history", {
      protocol: "compound",
      limit: 10,
    });
  });

  it("getFundRaises invokes correct tool", async () => {
    await getFundRaises({ limit: 15 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_fund_raises", {
      limit: 15,
    });
  });

  it("getWhaleTransfers invokes correct tool", async () => {
    await getWhaleTransfers({ symbol: "ETH", limit: 25 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_whale_transfers", {
      symbol: "ETH",
      limit: 25,
    });
  });

  it("getGovernance invokes correct tool", async () => {
    await getGovernance({ protocol: "uniswap", status: "active", limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_governance", {
      protocol: "uniswap",
      status: "active",
      limit: 10,
    });
  });

  it("getNews invokes correct tool", async () => {
    await getNews({ limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_news", {
      limit: 10,
    });
  });

  it("getAirdrops invokes correct tool", async () => {
    await getAirdrops({ limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "research_airdrops", {
      limit: 10,
    });
  });
});
