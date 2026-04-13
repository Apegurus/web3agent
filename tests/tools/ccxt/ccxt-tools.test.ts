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

describe("ccxt tool definitions", () => {
  beforeEach(() => {
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
    expect(result.content?.[0]?.text).toContain("binance_main");
  });
});
