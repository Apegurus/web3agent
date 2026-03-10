import { describe, expect, it, vi } from "vitest";
import { getLifiToolDefinitions } from "../../src/tools/lifi/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

vi.mock("@lifi/sdk", () => ({
  createConfig: vi.fn(),
  EVM: vi.fn().mockReturnValue({}),
  convertQuoteToRoute: vi.fn(),
  getChains: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Ethereum",
      nativeToken: { symbol: "ETH" },
      key: "eth",
      chainType: "EVM",
      coin: "ETH",
      mainnet: true,
    },
    {
      id: 8453,
      name: "Base",
      nativeToken: { symbol: "ETH" },
      key: "bas",
      chainType: "EVM",
      coin: "ETH",
      mainnet: true,
    },
  ]),
  getQuote: vi.fn().mockResolvedValue({
    id: "quote-1",
    type: "lifi",
    tool: "connext",
    toolDetails: { key: "connext", name: "Connext", logoURI: "" },
    action: {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: {
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        chainId: 1,
        name: "Ether",
      },
      toToken: {
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        chainId: 8453,
        name: "Ether",
      },
      fromAmount: "1000000000000000000",
    },
    estimate: {
      tool: "connext",
      fromAmount: "1000000000000000000",
      fromAmountUSD: "3000",
      toAmount: "1000000000000000000",
      toAmountUSD: "2990",
      toAmountMin: "990000000000000000",
      approvalAddress: "0x0",
      executionDuration: 300,
      gasCosts: [
        {
          type: "SUM",
          price: "0",
          estimate: "0",
          limit: "0",
          amount: "0",
          amountUSD: "5",
          token: {},
        },
      ],
    },
    includedSteps: [
      {
        id: "step-1",
        type: "cross",
        tool: "connext",
        toolDetails: { key: "connext", name: "Connext", logoURI: "" },
        action: {},
        estimate: {},
      },
    ],
  }),
  executeRoute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x1234567890123456789012345678901234567890",
    chainId: 1,
  }),
  getActiveAccount: vi.fn().mockReturnValue({}),
}));

describe("LI.FI tools", () => {
  it("lifi_get_chains returns list of chains", async () => {
    const tools = getLifiToolDefinitions();
    const getChainsTool = tools.find((t) => t.name === "lifi_get_chains") as ToolDefinition;
    const result = await getChainsTool.handler({});
    expect(result.isError).toBe(false);
    const chains = JSON.parse(result.content[0].text as string);
    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0].id).toBeDefined();
    expect(chains[0].nativeToken).toBe("ETH");
  });

  it("lifi_get_quote returns trimmed summary", async () => {
    const tools = getLifiToolDefinitions();
    const quoteTool = tools.find((t) => t.name === "lifi_get_quote") as ToolDefinition;
    const result = await quoteTool.handler({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x0000000000000000000000000000000000000000",
      toTokenAddress: "0x0000000000000000000000000000000000000000",
      fromAmount: "1000000000000000000",
    });
    expect(result.isError).toBe(false);
    const quote = JSON.parse(result.content[0].text as string);
    expect(quote.fromChainId).toBeDefined();
    expect(quote.toChainId).toBeDefined();
    expect(quote.toAmount).toBeDefined();
    expect(quote.estimatedDurationSeconds).toBe(300);
    expect(quote.gasCostUSD).toBe("5");
    expect(quote.action).toBeUndefined();
    expect(quote.transactionRequest).toBeUndefined();
    expect(quote.id).toBeUndefined();
  });

  it("lifi_get_quote returns error on missing params", async () => {
    const tools = getLifiToolDefinitions();
    const quoteTool = tools.find((t) => t.name === "lifi_get_quote") as ToolDefinition;
    const result = await quoteTool.handler({ fromChainId: 1 });
    expect(result.isError).toBe(true);
    const err = JSON.parse(result.content[0].text as string);
    expect(err.error).toBe("INVALID_PARAMS");
  });
});
