import { z } from "zod";
import { loadCcxtAccountRegistry } from "../../ccxt/config.js";
import { CcxtExchangeFactory } from "../../ccxt/factory.js";
import { invokeCcxtPublicCall } from "../../ccxt/invoke.js";
import { getConfig } from "../../config/env.js";
import { isPlainObject } from "../../utils/type-guards.js";
import {
  fundingRateEntrySchema,
  klineEntrySchema,
  orderBookResultSchema,
  tickerResultSchema,
} from "../../api/schemas/outputs.js";

const factoryCache = new Map<string, CcxtExchangeFactory>();

function getBinanceFactory(): CcxtExchangeFactory {
  const config = getConfig();
  const cacheKey = config.ccxtConfigPath ?? "__no-ccxt-config__";
  const cached = factoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const factory = new CcxtExchangeFactory(
    loadCcxtAccountRegistry({ ccxtConfigPath: config.ccxtConfigPath })
  );
  factoryCache.set(cacheKey, factory);
  return factory;
}

function stringifyValue(value: unknown, label: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Binance compatibility shim expected ${label} in CCXT response`);
  }
  return String(value);
}

// ── getTicker ─────────────────────────────────────────────────────

export type BinanceTicker = z.infer<typeof tickerResultSchema>;

export async function getTicker(input: { symbol: string }): Promise<BinanceTicker> {
  const response = await invokeCcxtPublicCall(
    {
      exchange: "binance",
      method: "fetchTicker",
      args: [input.symbol],
    },
    getBinanceFactory()
  );
  const data = response.result;
  if (!isPlainObject(data)) {
    throw new Error("CCXT ticker response must be an object");
  }

  return tickerResultSchema.parse({
    symbol: typeof data.symbol === "string" ? data.symbol : input.symbol,
    lastPrice: stringifyValue(data.last, "last price"),
    priceChange: stringifyValue(data.change, "price change"),
    priceChangePercent: stringifyValue(data.percentage, "price change percent"),
    highPrice: stringifyValue(data.high, "high price"),
    lowPrice: stringifyValue(data.low, "low price"),
    volume: stringifyValue(data.baseVolume, "base volume"),
    quoteVolume: stringifyValue(data.quoteVolume, "quote volume"),
    bidPrice: stringifyValue(data.bid, "bid price"),
    askPrice: stringifyValue(data.ask, "ask price"),
  });
}

// ── getKlines ─────────────────────────────────────────────────────

export type BinanceKline = z.infer<typeof klineEntrySchema>;

export async function getKlines(input: {
  symbol: string;
  interval: string;
  limit?: number;
}): Promise<BinanceKline[]> {
  const limit = input.limit ?? 100;
  const response = await invokeCcxtPublicCall(
    {
      exchange: "binance",
      method: "fetchOHLCV",
      args: [input.symbol, input.interval, undefined, limit],
    },
    getBinanceFactory()
  );
  if (!Array.isArray(response.result)) {
    throw new Error("CCXT OHLCV response must be an array");
  }

  return z.array(klineEntrySchema).parse(
    response.result.map((entry) => {
      if (!Array.isArray(entry) || entry.length < 6) {
        throw new Error("CCXT OHLCV entry must be an array with at least 6 values");
      }
      const [openTime, open, high, low, close, volume, quoteVolume = "0", trades = 0] = entry;
      return {
        openTime: Number(openTime),
        open: stringifyValue(open, "open price"),
        high: stringifyValue(high, "high price"),
        low: stringifyValue(low, "low price"),
        close: stringifyValue(close, "close price"),
        volume: stringifyValue(volume, "volume"),
        quoteVolume: stringifyValue(quoteVolume, "quote volume"),
        trades: Number(trades),
      };
    })
  );
}

// ── getOrderBook ──────────────────────────────────────────────────

export type BinanceOrderBook = z.infer<typeof orderBookResultSchema>;

export async function getOrderBook(input: {
  symbol: string;
  limit?: string;
}): Promise<BinanceOrderBook> {
  const limit = Number(input.limit ?? "20");
  const response = await invokeCcxtPublicCall(
    {
      exchange: "binance",
      method: "fetchOrderBook",
      args: [input.symbol, limit],
    },
    getBinanceFactory()
  );
  const data = response.result;
  if (!isPlainObject(data) || !Array.isArray(data.bids) || !Array.isArray(data.asks)) {
    throw new Error("CCXT order book response must include bid and ask arrays");
  }

  return orderBookResultSchema.parse({
    lastUpdateId: Number(data.lastUpdateId ?? data.nonce ?? 0),
    bids: data.bids.map((level) => {
      if (!Array.isArray(level) || level.length < 2) {
        throw new Error("CCXT order book bid level must be a tuple");
      }
      return {
        price: stringifyValue(level[0], "bid price"),
        quantity: stringifyValue(level[1], "bid quantity"),
      };
    }),
    asks: data.asks.map((level) => {
      if (!Array.isArray(level) || level.length < 2) {
        throw new Error("CCXT order book ask level must be a tuple");
      }
      return {
        price: stringifyValue(level[0], "ask price"),
        quantity: stringifyValue(level[1], "ask quantity"),
      };
    }),
  });
}

// ── getFundingRates ───────────────────────────────────────────────

export type BinanceFundingRate = z.infer<typeof fundingRateEntrySchema>;

export async function getFundingRates(input: {
  symbol: string;
  limit?: number;
}): Promise<BinanceFundingRate[]> {
  const limit = input.limit ?? 10;
  const response = await invokeCcxtPublicCall(
    {
      exchange: "binance",
      method: "fetchFundingRateHistory",
      args: [input.symbol, undefined, limit],
    },
    getBinanceFactory()
  );
  if (!Array.isArray(response.result)) {
    throw new Error("CCXT funding-rate response must be an array");
  }

  return z.array(fundingRateEntrySchema).parse(
    response.result.map((entry) => {
      if (!isPlainObject(entry)) {
        throw new Error("CCXT funding-rate entry must be an object");
      }
      const info = isPlainObject(entry.info) ? entry.info : undefined;
      return {
        fundingTime: Number(entry.timestamp ?? entry.fundingTime),
        fundingRate: stringifyValue(entry.fundingRate, "funding rate"),
        markPrice: stringifyValue(entry.markPrice ?? info?.markPrice, "mark price"),
      };
    })
  );
}
