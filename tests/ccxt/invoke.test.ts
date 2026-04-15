import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  class BaseMockExchange {
    id: string;
    name: string;
    has: Record<string, boolean>;
    options: Record<string, unknown>;
    markets?: Record<string, unknown>;
    symbols?: string[];
    setSandboxMode = vi.fn();
    loadMarkets = vi.fn(async (_reload?: boolean) => {
      this.markets = {
        "BTC/USDT": { symbol: "BTC/USDT" },
      };
      this.symbols = ["BTC/USDT"];
      return this.markets;
    });
    setMarketsFromExchange = vi.fn((exchange: BaseMockExchange) => {
      this.markets = exchange.markets;
      this.symbols = exchange.symbols;
    });
    fetchTicker = vi.fn(async (symbol: string, params?: Record<string, unknown>) => ({
      symbol,
      params,
      exchangeId: this.id,
    }));
    fetchBalance = vi.fn(async () => ({
      total: { USDT: 1000 },
      exchangeId: this.id,
    }));
    createOrder = vi.fn(async (symbol: string, type: string, side: string, amount: number) => ({
      id: "order-1",
      symbol,
      type,
      side,
      amount,
      exchangeId: this.id,
    }));

    constructor(id: string, name: string, config: Record<string, unknown> = {}) {
      this.id = id;
      this.name = name;
      this.options = (config.options as Record<string, unknown> | undefined) ?? {};
      this.has = {
        spot: true,
        margin: true,
        future: true,
        swap: true,
        option: false,
      };
    }
  }

  class BinanceExchange extends BaseMockExchange {
    constructor(config: Record<string, unknown> = {}) {
      super("binance", "Binance", config);
    }
  }

  return {
    constructors: {
      binance: BinanceExchange,
    },
  };
});

vi.mock("ccxt", () => ({
  default: {
    exchanges: ["binance"],
    binance: mockState.constructors.binance,
  },
}));

import { CcxtExchangeFactory } from "../../src/ccxt/factory.js";
import {
  invokeCcxtPrivateRead,
  invokeCcxtPrivateWrite,
  invokeCcxtPublicCall,
} from "../../src/ccxt/invoke.js";
import type { CcxtAccountRegistry } from "../../src/ccxt/types.js";

describe("ccxt invoke helpers", () => {
  let factory: CcxtExchangeFactory;

  beforeEach(() => {
    const registry: CcxtAccountRegistry = {
      accounts: [
        {
          name: "binance_main",
          exchangeId: "binance",
          apiKey: "key",
          secret: "secret",
          defaultType: "swap",
        },
      ],
      warnings: [],
      insecurePermissions: false,
    };

    factory = new CcxtExchangeFactory(registry);
  });

  it("invokes a public method through ccxt_public_call", async () => {
    const result = await invokeCcxtPublicCall(
      {
        exchange: "binance",
        method: "fetchTicker",
        args: ["BTC/USDT"],
      },
      factory
    );

    expect(result).toEqual({
      exchangeId: "binance",
      method: "fetchTicker",
      classification: "public",
      result: {
        symbol: "BTC/USDT",
        params: undefined,
        exchangeId: "binance",
      },
    });
  });

  it("invokes an authenticated read through ccxt_private_read", async () => {
    const result = await invokeCcxtPrivateRead(
      {
        account: "binance_main",
        method: "fetchBalance",
      },
      factory
    );

    expect(result).toEqual({
      account: "binance_main",
      exchangeId: "binance",
      method: "fetchBalance",
      classification: "private_read",
      result: {
        total: { USDT: 1000 },
        exchangeId: "binance",
      },
    });
  });

  it("invokes an authenticated write through ccxt_private_write", async () => {
    const result = await invokeCcxtPrivateWrite(
      {
        account: "binance_main",
        method: "createOrder",
        args: ["BTC/USDT", "limit", "buy", 1],
      },
      factory
    );

    expect(result).toEqual({
      account: "binance_main",
      exchangeId: "binance",
      method: "createOrder",
      classification: "private_write",
      result: {
        id: "order-1",
        symbol: "BTC/USDT",
        type: "limit",
        side: "buy",
        amount: 1,
        exchangeId: "binance",
      },
    });
  });

  it("rejects a misclassified method before invocation", async () => {
    await expect(
      invokeCcxtPublicCall(
        {
          exchange: "binance",
          method: "fetchBalance",
        },
        factory
      )
    ).rejects.toThrow("not allowed for ccxt_public_call");
  });

  it("throws when exchange does not implement the requested method", async () => {
    await expect(
      invokeCcxtPublicCall(
        {
          exchange: "binance",
          method: "publicGetNonExistent",
        },
        factory
      )
    ).rejects.toThrow();
  });
});
