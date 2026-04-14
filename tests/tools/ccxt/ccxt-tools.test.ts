import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  listAccountSummaries: vi.fn(),
  describeExchangeCapabilities: vi.fn(),
  invokeCcxtPublicCall: vi.fn(),
  invokeCcxtPrivateRead: vi.fn(),
  invokeCcxtPrivateWrite: vi.fn(),
}));

vi.mock("ccxt", () => ({
  default: {
    exchanges: ["binance", "kraken"],
    binance: class {
      id = "binance";
      name = "Binance";
      countries = ["JP"];
      urls = { api: "https://api.binance.com" };
      has = { spot: true, swap: true };
      timeframes = { "1m": "1m" };
    },
    kraken: class {
      id = "kraken";
      name = "Kraken";
      countries = ["US"];
      urls = { api: "https://api.kraken.com" };
      has = { spot: true };
      timeframes = { "1h": "1h" };
    },
  },
}));

vi.mock("../../../src/ccxt/runtime-state.js", () => ({
  getCcxtRuntimeState: () => ({
    factory: {
      getPublicExchange: vi.fn(async () => ({
        id: "binance",
        name: "Binance",
        has: { spot: true },
        loadMarkets: vi.fn(),
      })),
      getPrivateExchange: vi.fn(async () => ({
        id: "binance",
        name: "Binance",
        has: { spot: true, swap: true },
        loadMarkets: vi.fn(),
      })),
    },
    registry: {
      accounts: [{ name: "binance_main", exchangeId: "binance" }],
      warnings: [],
    },
  }),
}));

vi.mock("../../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enabled: false,
    enqueue: vi.fn(() => ({ queued: false, id: null, summary: "bypassed" })),
  },
  registerExecutor: vi.fn(),
}));

vi.mock("../../../src/ccxt/accounts.js", () => ({
  listAccountSummaries: (...args: unknown[]) => mockState.listAccountSummaries(...args),
  getAccountByName: vi.fn(),
  resolveExchangeIdFromAccount: vi.fn(),
}));

vi.mock("../../../src/ccxt/capabilities.js", () => ({
  describeExchangeCapabilities: (...args: unknown[]) =>
    mockState.describeExchangeCapabilities(...args),
}));

vi.mock("../../../src/ccxt/invoke.js", () => ({
  invokeCcxtPublicCall: (...args: unknown[]) => mockState.invokeCcxtPublicCall(...args),
  invokeCcxtPrivateRead: (...args: unknown[]) => mockState.invokeCcxtPrivateRead(...args),
  invokeCcxtPrivateWrite: (...args: unknown[]) => mockState.invokeCcxtPrivateWrite(...args),
}));

import { getCcxtToolDefinitions } from "../../../src/tools/ccxt/index.js";

function getFirstTextContent(result: { content?: Array<{ type: string; text?: string }> }) {
  const part = result.content?.[0];
  expect(part?.type).toBe("text");
  if (!part || part.type !== "text") {
    throw new Error("Expected first content part to be text");
  }
  return part.text;
}

describe("ccxt tool definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.listAccountSummaries.mockReturnValue([
      {
        name: "binance_main",
        exchangeId: "binance",
        sandbox: false,
        hasPassword: false,
        hasUid: false,
        hasWalletAddress: false,
      },
    ]);
    mockState.describeExchangeCapabilities.mockReturnValue({
      exchangeId: "binance",
      name: "Binance",
      has: { spot: true },
      marketTypes: ["spot"],
      configuredAccounts: ["binance_main"],
      requiresAuthFor: ["private_read", "private_write"],
      supportedInvocationModes: ["public", "private_read", "private_write"],
    });
    mockState.invokeCcxtPublicCall.mockResolvedValue({
      exchangeId: "binance",
      method: "fetchTicker",
      classification: "public",
      result: { symbol: "BTC/USDT" },
    });
    mockState.invokeCcxtPrivateRead.mockResolvedValue({
      account: "binance_main",
      exchangeId: "binance",
      method: "fetchBalance",
      classification: "private_read",
      result: { total: { USDT: 100 } },
    });
    mockState.invokeCcxtPrivateWrite.mockResolvedValue({
      account: "binance_main",
      exchangeId: "binance",
      method: "createOrder",
      classification: "private_write",
      result: { id: "order-1" },
    });
  });

  it("registers the expected CCXT tool family", () => {
    expect(getCcxtToolDefinitions().map((tool) => tool.name)).toEqual([
      "ccxt_list_exchanges",
      "ccxt_describe_exchange",
      "ccxt_list_accounts",
      "ccxt_public_call",
      "ccxt_private_read",
      "ccxt_private_write",
    ]);
  });

  it("lists configured accounts through the tool handler", async () => {
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_list_accounts");
    if (!tool) {
      throw new Error("Missing ccxt_list_accounts tool");
    }

    const result = await tool.handler({});

    expect(result.isError).toBe(false);
    expect(getFirstTextContent(result)).toContain("binance_main");
  });

  it("lists exchanges through the tool handler", async () => {
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_list_exchanges");
    if (!tool) throw new Error("Missing ccxt_list_exchanges tool");

    const result = await tool.handler({});

    expect(result.isError).toBe(false);
    const text = getFirstTextContent(result);
    expect(text).toContain("binance");
    expect(text).toContain("kraken");
  });

  it("invokes a public CCXT method through the tool handler", async () => {
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_public_call");
    if (!tool) throw new Error("Missing ccxt_public_call tool");

    const result = await tool.handler({
      exchange: "binance",
      method: "fetchTicker",
      args: ["BTC/USDT"],
    });

    expect(result.isError).toBe(false);
    expect(mockState.invokeCcxtPublicCall).toHaveBeenCalledWith(
      {
        exchange: "binance",
        method: "fetchTicker",
        args: ["BTC/USDT"],
      },
      expect.anything()
    );
  });

  it("returns pending_confirmation when confirmation queue accepts the operation", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    vi.mocked(mockQueue.enqueue).mockReturnValueOnce({
      queued: true,
      id: "test-pending-id",
      summary: "CCXT createOrder on account binance_main",
    });

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    const result = await tool.handler({
      account: "binance_main",
      method: "createOrder",
      args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
    });

    expect(result.isError).toBe(false);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      "ccxt_private_write",
      "CCXT createOrder on account binance_main",
      {
        account: "binance_main",
        method: "createOrder",
        args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
      },
      expect.any(Function),
      undefined,
      "financial"
    );
    const text = getFirstTextContent(result);
    expect(text).toContain("pending_confirmation");
    expect(text).toContain("test-pending-id");
  });

  it("executes private write directly when confirmations are bypassed", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    const result = await tool.handler({
      account: "binance_main",
      method: "createOrder",
      args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
    });

    expect(result.isError).toBe(false);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      "ccxt_private_write",
      "CCXT createOrder on account binance_main",
      {
        account: "binance_main",
        method: "createOrder",
        args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
      },
      expect.any(Function),
      undefined,
      "financial"
    );
    expect(mockState.invokeCcxtPrivateWrite).toHaveBeenCalledWith(
      {
        account: "binance_main",
        method: "createOrder",
        args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
      },
      expect.anything()
    );
  });

  it("refuses withdraw when confirmations are disabled", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    const result = await tool.handler({
      account: "binance_main",
      method: "withdraw",
      args: ["USDT", 1, "0xabc"],
    });

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result)).toContain(
      "Method 'withdraw' requires confirmation to be enabled"
    );
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
    expect(mockState.invokeCcxtPrivateWrite).not.toHaveBeenCalled();
  });
});
