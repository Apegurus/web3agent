import { resilientFetch } from "../../utils/resilient-fetch.js";

function checkGeoRestriction(res: Response): void {
  if (res.status === 451 || res.status === 403) {
    throw new Error(
      "Binance API is not available in your region. Consider using a VPN or the DefiLlama-based market tools as alternatives."
    );
  }
}

// ── getTicker ─────────────────────────────────────────────────────

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
}

export async function getTicker(input: { symbol: string }): Promise<BinanceTicker> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${input.symbol}`;
  const res = await resilientFetch(url, undefined, { label: "binance-ticker" });
  checkGeoRestriction(res);
  if (!res.ok) {
    throw new Error(`Binance ticker request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as BinanceTicker;
  return {
    symbol: data.symbol,
    lastPrice: data.lastPrice,
    priceChange: data.priceChange,
    priceChangePercent: data.priceChangePercent,
    highPrice: data.highPrice,
    lowPrice: data.lowPrice,
    volume: data.volume,
    quoteVolume: data.quoteVolume,
    bidPrice: data.bidPrice,
    askPrice: data.askPrice,
  };
}

// ── getKlines ─────────────────────────────────────────────────────

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  trades: number;
}

type BinanceKlineRaw = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteVolume
  number, // trades
  string, // takerBuyBase
  string, // takerBuyQuote
  string, // ignore
];

export async function getKlines(input: {
  symbol: string;
  interval: string;
  limit?: number;
}): Promise<BinanceKline[]> {
  const limit = input.limit ?? 100;
  const url = `https://api.binance.com/api/v3/klines?symbol=${input.symbol}&interval=${input.interval}&limit=${limit}`;
  const res = await resilientFetch(url, undefined, { label: "binance-klines" });
  checkGeoRestriction(res);
  if (!res.ok) {
    throw new Error(`Binance klines request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as BinanceKlineRaw[];
  return data.map((k) => ({
    openTime: k[0],
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
    quoteVolume: k[7],
    trades: k[8],
  }));
}

// ── getOrderBook ──────────────────────────────────────────────────

export interface BinanceOrderBook {
  lastUpdateId: number;
  bids: { price: string; quantity: string }[];
  asks: { price: string; quantity: string }[];
}

interface BinanceDepthRaw {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export async function getOrderBook(input: {
  symbol: string;
  limit?: string;
}): Promise<BinanceOrderBook> {
  const limit = input.limit ?? "20";
  const url = `https://api.binance.com/api/v3/depth?symbol=${input.symbol}&limit=${limit}`;
  const res = await resilientFetch(url, undefined, { label: "binance-orderbook" });
  checkGeoRestriction(res);
  if (!res.ok) {
    throw new Error(`Binance order book request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as BinanceDepthRaw;
  return {
    lastUpdateId: data.lastUpdateId,
    bids: data.bids.map(([price, quantity]) => ({ price, quantity })),
    asks: data.asks.map(([price, quantity]) => ({ price, quantity })),
  };
}

// ── getFundingRates ───────────────────────────────────────────────

export interface BinanceFundingRate {
  fundingTime: number;
  fundingRate: string;
  markPrice: string;
}

interface BinanceFundingRateRaw {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
  markPrice: string;
}

export async function getFundingRates(input: {
  symbol: string;
  limit?: number;
}): Promise<BinanceFundingRate[]> {
  const limit = input.limit ?? 10;
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${input.symbol}&limit=${limit}`;
  const res = await resilientFetch(url, undefined, { label: "binance-funding" });
  checkGeoRestriction(res);
  if (!res.ok) {
    throw new Error(`Binance funding rates request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as BinanceFundingRateRaw[];
  return data.map((d) => ({
    fundingTime: d.fundingTime,
    fundingRate: d.fundingRate,
    markPrice: d.markPrice,
  }));
}
