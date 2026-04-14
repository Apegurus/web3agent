import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const instances: Array<Record<string, unknown>> = [];

  class BaseMockExchange {
    id: string;
    name: string;
    has: Record<string, boolean>;
    options: Record<string, unknown>;
    markets?: Record<string, unknown>;
    symbols?: string[];
    sandboxMode = false;
    setSandboxMode = vi.fn((enabled: boolean) => {
      this.sandboxMode = enabled;
    });
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

    constructor(id: string, name: string, config: Record<string, unknown> = {}) {
      this.id = id;
      this.name = name;
      this.options = (config.options as Record<string, unknown> | undefined) ?? {};
      this.has = {
        spot: true,
        margin: id === "binance",
        future: id === "binance",
        swap: true,
        option: false,
      };
      instances.push(this as unknown as Record<string, unknown>);
    }
  }

  class BinanceExchange extends BaseMockExchange {
    constructor(config: Record<string, unknown> = {}) {
      super("binance", "Binance", config);
    }
  }

  class KrakenExchange extends BaseMockExchange {
    constructor(config: Record<string, unknown> = {}) {
      super("kraken", "Kraken", config);
    }
  }

  return {
    instances,
    constructors: {
      binance: BinanceExchange,
      kraken: KrakenExchange,
    },
  };
});

vi.mock("ccxt", () => ({
  default: {
    exchanges: ["binance", "kraken"],
    binance: mockState.constructors.binance,
    kraken: mockState.constructors.kraken,
  },
}));

import { CcxtExchangeFactory } from "../../src/ccxt/factory.js";
import type { CcxtAccountRegistry } from "../../src/ccxt/types.js";

describe("CcxtExchangeFactory", () => {
  let registry: CcxtAccountRegistry;

  beforeEach(() => {
    mockState.instances.length = 0;
    registry = {
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
    };
  });

  it("caches public instances by exchangeId + marketType + sandbox", async () => {
    const factory = new CcxtExchangeFactory(registry);

    const first = await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "spot",
      sandbox: false,
    });
    const second = await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "spot",
      sandbox: false,
    });
    const third = await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "swap",
      sandbox: false,
    });

    expect(first).toBe(second);
    expect(third).not.toBe(first);
  });

  it("caches private instances by account name", async () => {
    const factory = new CcxtExchangeFactory(registry);

    const first = await factory.getPrivateExchange({ accountName: "binance_main" });
    const second = await factory.getPrivateExchange({ accountName: "binance_main" });

    expect(first).toBe(second);
  });

  it("calls loadMarkets when requested", async () => {
    const factory = new CcxtExchangeFactory(registry);

    const exchange = await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "spot",
      sandbox: false,
      loadMarkets: true,
    });

    expect(exchange.loadMarkets).toHaveBeenCalledTimes(1);
  });

  it("reuses cached markets when available for private instances", async () => {
    const factory = new CcxtExchangeFactory(registry);

    const publicExchange = await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "swap",
      sandbox: false,
      loadMarkets: true,
    });
    const privateExchange = await factory.getPrivateExchange({
      accountName: "binance_main",
      loadMarkets: true,
    });

    expect(privateExchange.setMarketsFromExchange).toHaveBeenCalledWith(publicExchange);
    expect(privateExchange.markets).toBe(publicExchange.markets);
  });

  it("does not reuse cached markets from a public exchange with a different marketType", async () => {
    const factory = new CcxtExchangeFactory(registry);

    await factory.getPublicExchange({
      exchangeId: "binance",
      marketType: "spot",
      sandbox: false,
      loadMarkets: true,
    });
    const privateExchange = await factory.getPrivateExchange({
      accountName: "binance_main",
      loadMarkets: false,
    });

    expect(privateExchange.setMarketsFromExchange).not.toHaveBeenCalled();
    expect(privateExchange.markets).toBeUndefined();
  });

  it("propagates loadMarkets network failures to the caller", async () => {
    const factory = new CcxtExchangeFactory(registry);

    // Force loadMarkets to reject on the next fresh instance
    const exchange = await factory.getPublicExchange({
      exchangeId: "kraken",
      marketType: "spot",
      sandbox: false,
      loadMarkets: false,
    });
    vi.mocked(exchange.loadMarkets).mockRejectedValueOnce(
      new Error("NetworkError: connection timed out")
    );

    await expect(
      factory.getPublicExchange({
        exchangeId: "kraken",
        marketType: "spot",
        sandbox: false,
        loadMarkets: true,
        reloadMarkets: true,
      })
    ).rejects.toThrow("NetworkError: connection timed out");
  });
});
