import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  listAccountSummaries: vi.fn(),
  describeExchangeCapabilities: vi.fn(),
  invokeCcxtPublicCall: vi.fn(),
  invokeCcxtPrivateRead: vi.fn(),
  invokeCcxtPrivateWrite: vi.fn(),
}));

const mockRegistry = vi.hoisted(() => ({
  accounts: [{ name: "binance_main", exchangeId: "binance", apiKey: "key", secret: "secret" }],
  warnings: [] as string[],
  insecurePermissions: false,
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
    registry: mockRegistry,
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
  accountHasCredentials: (account: { apiKey?: string; secret?: string; privateKey?: string }) =>
    Boolean(account.privateKey) || (Boolean(account.apiKey) && Boolean(account.secret)),
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
    mockRegistry.insecurePermissions = false;
    mockState.listAccountSummaries.mockReturnValue([
      {
        name: "binance_main",
        exchangeId: "binance",
        sandbox: false,
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

  it("registers ccxt_private_write with a dynamic riskLevel classifier", () => {
    const tool = getCcxtToolDefinitions().find((t) => t.name === "ccxt_private_write");

    expect(tool).toBeDefined();
    expect(typeof tool?.riskLevel).toBe("function");

    if (typeof tool?.riskLevel !== "function") {
      throw new Error("Expected ccxt_private_write riskLevel to be a classifier function");
    }

    const classify = tool.riskLevel as (args: Record<string, unknown>) => string;
    expect(classify({ method: "createOrder" })).toBe("financial");
    expect(classify({ method: "editOrder" })).toBe("financial");
    expect(classify({ method: "cancelOrder" })).toBe("destructive");
    expect(classify({ method: "setLeverage" })).toBe("destructive");
    expect(classify({})).toBe("financial"); // conservative default when method missing
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
        estimatedUsd: 50,
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
        estimatedUsd: 50,
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

  it("enqueues only policy-safe params, not raw args", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    vi.mocked(mockQueue.enqueue).mockReturnValueOnce({
      queued: true,
      id: "test-pending-id",
      summary: "CCXT createOrder on account binance_main",
    });

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    await tool.handler({
      account: "binance_main",
      method: "createOrder",
      args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
    });

    const enqueueCall = vi.mocked(mockQueue.enqueue).mock.calls.at(-1);
    expect(enqueueCall).toBeDefined();
    expect(enqueueCall?.[2]).toEqual({
      account: "binance_main",
      method: "createOrder",
      estimatedUsd: 50,
    });
    expect(enqueueCall?.[2]).not.toHaveProperty("args");
    expect(enqueueCall?.[5]).toBe("financial");
  });

  it("omits estimatedUsd from enqueued params for market orders (price unknown)", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    vi.mocked(mockQueue.enqueue).mockReturnValueOnce({
      queued: true,
      id: "test-market-id",
      summary: "CCXT createOrder on account binance_main",
    });

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    await tool.handler({
      account: "binance_main",
      method: "createOrder",
      args: ["BTC/USDT", "market", "buy", 0.001],
    });

    const enqueueCall = vi.mocked(mockQueue.enqueue).mock.calls.at(-1);
    expect(enqueueCall?.[2]).toEqual({
      account: "binance_main",
      method: "createOrder",
    });
    expect(enqueueCall?.[2]).not.toHaveProperty("estimatedUsd");
    expect(enqueueCall?.[2]).not.toHaveProperty("args");
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

  it("refuses implicit transfer endpoint when confirmations are disabled", async () => {
    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    const result = await tool.handler({
      account: "binance_main",
      method: "sapiPrivatePostAssetTransfer",
      args: [{ asset: "USDT", amount: "100" }],
    });

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result)).toContain("requires confirmation to be enabled");
  });

  it("enqueues cancelOrder with destructive riskLevel (not financial)", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    vi.mocked(mockQueue.enqueue).mockReturnValueOnce({
      queued: true,
      id: "cancel-pending-id",
      summary: "CCXT cancelOrder on account binance_main",
    });

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    await tool.handler({
      account: "binance_main",
      method: "cancelOrder",
      args: ["order-id-123", "BTC/USDT"],
    });

    const enqueueCall = vi.mocked(mockQueue.enqueue).mock.calls.at(-1);
    expect(enqueueCall).toBeDefined();
    // 6th arg to enqueue() is riskLevel
    expect(enqueueCall?.[5]).toBe("destructive");
  });

  it("enqueues createOrder with financial riskLevel", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    vi.mocked(mockQueue.enqueue).mockReturnValueOnce({
      queued: true,
      id: "create-pending-id",
      summary: "CCXT createOrder on account binance_main",
    });

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    await tool.handler({
      account: "binance_main",
      method: "createOrder",
      args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
    });

    const enqueueCall = vi.mocked(mockQueue.enqueue).mock.calls.at(-1);
    expect(enqueueCall?.[5]).toBe("financial");
  });

  it("rejects withdraw when config permissions are insecure", async () => {
    const { confirmationQueue: mockQueue } = await import("../../../src/wallet/confirmation.js");
    Object.defineProperty(mockQueue, "enabled", {
      value: true,
      writable: true,
      configurable: true,
    });
    mockRegistry.insecurePermissions = true;

    const tool = getCcxtToolDefinitions().find((entry) => entry.name === "ccxt_private_write");
    if (!tool) throw new Error("Missing ccxt_private_write tool");

    const result = await tool.handler({
      account: "binance_main",
      method: "withdraw",
      args: ["USDT", 100, "0xaddr"],
    });

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result)).toContain("insecure permissions");
    expect(mockState.invokeCcxtPrivateWrite).not.toHaveBeenCalled();
    Object.defineProperty(mockQueue, "enabled", {
      value: false,
      writable: true,
      configurable: true,
    });
  });
});
