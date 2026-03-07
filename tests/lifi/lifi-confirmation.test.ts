import { describe, expect, it, vi } from "vitest";
import { getLifiToolDefinitions } from "../../src/tools/lifi/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

vi.mock("@lifi/sdk", () => ({
  createConfig: vi.fn(),
  EVM: vi.fn().mockReturnValue({}),
  convertQuoteToRoute: vi.fn(),
  getChains: vi.fn().mockResolvedValue([]),
  getQuote: vi.fn().mockResolvedValue({
    id: "quote-1",
    type: "lifi",
    tool: "connext",
    toolDetails: { key: "connext", name: "Connext", logoURI: "" },
    action: {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: { symbol: "ETH" },
      toToken: { symbol: "ETH" },
      fromAmount: "1e18",
    },
    estimate: {
      tool: "connext",
      fromAmount: "1e18",
      fromAmountUSD: "3000",
      toAmount: "1e18",
      toAmountUSD: "2990",
      toAmountMin: "0.99e18",
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
    includedSteps: [],
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

vi.mock("../../src/wallet/confirmation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/wallet/confirmation.js")>();
  return {
    ...real,
    confirmationQueue: new real.ConfirmationQueueManager(true),
  };
});

describe("lifi_execute_bridge — confirmation gating", () => {
  it("enqueues bridge operation instead of executing immediately", async () => {
    const tools = getLifiToolDefinitions();
    const bridgeTool = tools.find((t) => t.name === "lifi_execute_bridge") as ToolDefinition;
    const result = await bridgeTool.handler({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x0000000000000000000000000000000000000000",
      toTokenAddress: "0x0000000000000000000000000000000000000000",
      fromAmount: "1000000000000000000",
    });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.status).toBe("queued");
    expect(parsed.operationId).toBeTruthy();
    expect(parsed.instruction).toContain("transaction_confirm");
  });

  it("rejects bridge in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getLifiToolDefinitions();
    const bridgeTool = tools.find((t) => t.name === "lifi_execute_bridge") as ToolDefinition;
    const result = await bridgeTool.handler({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x0000000000000000000000000000000000000000",
      toTokenAddress: "0x0000000000000000000000000000000000000000",
      fromAmount: "1000000000000000000",
    });
    expect(result.isError).toBe(true);
    const err = JSON.parse(result.content[0].text as string);
    expect(err.error).toBe("WALLET_REQUIRED");
  });
});
