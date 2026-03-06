import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@orbs-network/liquidity-hub-sdk", () => ({
  constructSDK: vi.fn().mockReturnValue({
    getQuote: vi.fn().mockResolvedValue({
      inToken: "0xTokenA",
      outToken: "0xTokenB",
      inAmount: "1000000000000000000",
      outAmount: "2000000000",
      minAmountOut: "1990000000",
      exchange: "paraswap",
      error: undefined,
      permitData: {},
      eip712: {},
      sessionId: "test-session",
      serializedOrder: "",
      qs: "",
      partner: "web3agent",
      slippage: 0.5,
      user: "0x0",
      gasAmountOut: "0",
      referencePrice: "0",
      userMinOutAmountWithGas: "0",
      outAmountWsMinusGas: "0",
      outAmountWS: "0",
      timestamp: Date.now(),
    }),
    swap: vi.fn().mockResolvedValue("0xabcdef"),
  }),
  permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  maxUint256:
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 8453 }),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi
    .fn()
    .mockReturnValue({ mode: "read-only", chainId: 8453 }),
  getActiveAccount: vi.fn().mockReturnValue({
    address: "0xTestAccount",
    signTypedData: vi.fn().mockResolvedValue("0x" + "ab".repeat(65)),
  }),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enabled: true,
    enqueue: vi.fn().mockReturnValue({
      queued: true,
      id: "test-id",
      summary: "Queued [orbs_swap]: test",
    }),
  },
}));

describe("Orbs quote tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orbs_get_quote succeeds on supported chain (Base 8453)", async () => {
    const { getOrbsToolDefinitions } = await import(
      "../../src/tools/orbs/index.js"
    );
    const tools = getOrbsToolDefinitions();
    const quoteTool = tools.find((t) => t.name === "orbs_get_quote");
    expect(quoteTool).toBeDefined();

    const result = await quoteTool!.handler({
      chainId: 8453,
      fromToken: "0xTokenA",
      toToken: "0xTokenB",
      inAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.outAmount).toBe("2000000000");
    expect(parsed.minAmountOut).toBe("1990000000");
    expect(parsed.exchange).toBe("paraswap");
  });

  it("orbs_get_quote returns structured error on unsupported chain (Ethereum 1)", async () => {
    const { getOrbsToolDefinitions } = await import(
      "../../src/tools/orbs/index.js"
    );
    const tools = getOrbsToolDefinitions();
    const quoteTool = tools.find((t) => t.name === "orbs_get_quote");

    const result = await quoteTool!.handler({
      chainId: 1,
      fromToken: "0xTokenA",
      toToken: "0xTokenB",
      inAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
    expect(parsed.message).toContain("not available on chain 1");
  });

  it("exports all expected tool names", async () => {
    const { getOrbsToolDefinitions } = await import(
      "../../src/tools/orbs/index.js"
    );
    const tools = getOrbsToolDefinitions();
    const names = tools.map((t) => t.name);

    expect(names).toContain("orbs_get_quote");
    expect(names).toContain("orbs_swap");
    expect(names).toContain("orbs_place_twap");
    expect(names).toContain("orbs_place_limit");
    expect(names).toContain("orbs_list_orders");
  });

  it("orbs_get_quote works on all supported chains", async () => {
    const { getOrbsToolDefinitions } = await import(
      "../../src/tools/orbs/index.js"
    );
    const tools = getOrbsToolDefinitions();
    const quoteTool = tools.find((t) => t.name === "orbs_get_quote")!;

    const supportedChains = [137, 56, 8453, 59144, 81457, 42161];
    for (const chainId of supportedChains) {
      const result = await quoteTool.handler({
        chainId,
        fromToken: "0xA",
        toToken: "0xB",
        inAmount: "1000",
      });
      expect(result.isError).toBe(false);
    }
  });
});
