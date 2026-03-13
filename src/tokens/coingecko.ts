import { getConfig } from "../config/env.js";

const COINGECKO_PUBLIC_API_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API_URL = "https://pro-api.coingecko.com/api/v3";
const COINGECKO_TOP_TOKENS_TTL_MS = 6 * 60 * 60 * 1000;

interface CoinGeckoMarketEntry {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
}

interface CoinGeckoCoinListEntry {
  id?: unknown;
  platforms?: unknown;
}

interface CoinGeckoAssetPlatformEntry {
  id?: unknown;
  chain_identifier?: unknown;
}

export interface CoinGeckoTopTokenSignals {
  symbols: ReadonlySet<string>;
  addressesByChain: ReadonlyMap<number, ReadonlySet<string>>;
}

const FALLBACK_PLATFORM_CHAIN_IDS: Readonly<Record<string, number>> = {
  ethereum: 1,
  "binance-smart-chain": 56,
  "polygon-pos": 137,
  "arbitrum-one": 42161,
  "optimistic-ethereum": 10,
  base: 8453,
  linea: 59144,
  avalanche: 43114,
  blast: 81457,
  zksync: 324,
  scroll: 534352,
  xdai: 100,
  celo: 42220,
  mantle: 5000,
  mode: 34443,
};

let cachedTopTokenSignals:
  | {
      fetchedAt: number;
      signals: CoinGeckoTopTokenSignals;
    }
  | undefined;

function getCoinGeckoApiKey(): string | undefined {
  try {
    return getConfig().coingeckoApiKey ?? process.env.COINGECKO_API_KEY;
  } catch (_error: unknown) {
    // Token discovery may run before runtime config is initialized.
    return process.env.COINGECKO_API_KEY;
  }
}

function getCoinGeckoBaseUrl(apiKey: string | undefined): string {
  return apiKey ? COINGECKO_PRO_API_URL : COINGECKO_PUBLIC_API_URL;
}

function getCoinGeckoHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    accept: "application/json",
    ...(apiKey ? { "x-cg-pro-api-key": apiKey } : {}),
  };
}

function isPlatformMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPlatformChainIds(
  payload: CoinGeckoAssetPlatformEntry[] | null
): ReadonlyMap<string, number> {
  const chainIds = new Map<string, number>(Object.entries(FALLBACK_PLATFORM_CHAIN_IDS));

  if (!payload) {
    return chainIds;
  }

  for (const entry of payload) {
    if (
      typeof entry.id === "string" &&
      typeof entry.chain_identifier === "number" &&
      Number.isFinite(entry.chain_identifier)
    ) {
      chainIds.set(entry.id, entry.chain_identifier);
    }
  }

  return chainIds;
}

function buildAddressSignals(
  topTokenIds: ReadonlySet<string>,
  coinListPayload: CoinGeckoCoinListEntry[] | null,
  platformChainIds: ReadonlyMap<string, number>
): ReadonlyMap<number, ReadonlySet<string>> {
  const addressesByChain = new Map<number, Set<string>>();

  if (!coinListPayload) {
    return new Map();
  }

  for (const entry of coinListPayload) {
    if (
      typeof entry.id !== "string" ||
      !topTokenIds.has(entry.id) ||
      !isPlatformMap(entry.platforms)
    ) {
      continue;
    }

    for (const [platformId, addressValue] of Object.entries(entry.platforms)) {
      if (typeof addressValue !== "string" || addressValue.length === 0) {
        continue;
      }

      const chainId = platformChainIds.get(platformId);
      if (!chainId) {
        continue;
      }

      let addresses = addressesByChain.get(chainId);
      if (!addresses) {
        addresses = new Set();
        addressesByChain.set(chainId, addresses);
      }

      addresses.add(addressValue.toLowerCase());
    }
  }

  return new Map(
    Array.from(addressesByChain.entries(), ([chainId, addresses]) => [chainId, new Set(addresses)])
  );
}

export async function getTopCoinGeckoSignals(): Promise<CoinGeckoTopTokenSignals | null> {
  if (
    cachedTopTokenSignals &&
    Date.now() - cachedTopTokenSignals.fetchedAt < COINGECKO_TOP_TOKENS_TTL_MS
  ) {
    return cachedTopTokenSignals.signals;
  }

  const apiKey = getCoinGeckoApiKey();
  const headers = getCoinGeckoHeaders(apiKey);
  const baseUrl = getCoinGeckoBaseUrl(apiKey);

  const marketsUrl = new URL("/coins/markets", baseUrl);
  marketsUrl.searchParams.set("vs_currency", "usd");
  marketsUrl.searchParams.set("order", "market_cap_desc");
  marketsUrl.searchParams.set("per_page", "100");
  marketsUrl.searchParams.set("page", "1");
  marketsUrl.searchParams.set("sparkline", "false");

  const coinListUrl = new URL("/coins/list", baseUrl);
  coinListUrl.searchParams.set("include_platform", "true");

  const assetPlatformsUrl = new URL("/asset_platforms", baseUrl);

  try {
    const [marketsResult, coinListResult, assetPlatformsResult] = await Promise.allSettled([
      fetch(marketsUrl, { headers }),
      fetch(coinListUrl, { headers }),
      fetch(assetPlatformsUrl, { headers }),
    ]);

    if (marketsResult.status !== "fulfilled") {
      process.stderr.write(`[tokens] CoinGecko top-token lookup failed: ${marketsResult.reason}\n`);
      return null;
    }

    if (!marketsResult.value.ok) {
      process.stderr.write(
        `[tokens] CoinGecko top-token lookup failed with status ${marketsResult.value.status}\n`
      );
      return null;
    }

    const marketPayload = (await marketsResult.value.json()) as CoinGeckoMarketEntry[];
    const topTokenIds = new Set(
      marketPayload
        .map((entry) => (typeof entry.id === "string" ? entry.id : null))
        .filter((id): id is string => Boolean(id))
    );
    const symbols = new Set(
      marketPayload
        .map((entry) => (typeof entry.symbol === "string" ? entry.symbol.toUpperCase() : null))
        .filter((symbol): symbol is string => Boolean(symbol))
    );

    let coinListPayload: CoinGeckoCoinListEntry[] | null = null;
    if (coinListResult.status === "fulfilled") {
      if (coinListResult.value.ok) {
        coinListPayload = (await coinListResult.value.json()) as CoinGeckoCoinListEntry[];
      } else {
        process.stderr.write(
          `[tokens] CoinGecko coin-platform lookup failed with status ${coinListResult.value.status}\n`
        );
      }
    } else {
      process.stderr.write(
        `[tokens] CoinGecko coin-platform lookup failed: ${coinListResult.reason}\n`
      );
    }

    let assetPlatformPayload: CoinGeckoAssetPlatformEntry[] | null = null;
    if (assetPlatformsResult.status === "fulfilled") {
      if (assetPlatformsResult.value.ok) {
        assetPlatformPayload =
          (await assetPlatformsResult.value.json()) as CoinGeckoAssetPlatformEntry[];
      } else {
        process.stderr.write(
          `[tokens] CoinGecko asset-platform lookup failed with status ${assetPlatformsResult.value.status}\n`
        );
      }
    } else {
      process.stderr.write(
        `[tokens] CoinGecko asset-platform lookup failed: ${assetPlatformsResult.reason}\n`
      );
    }

    const signals: CoinGeckoTopTokenSignals = {
      symbols,
      addressesByChain: buildAddressSignals(
        topTokenIds,
        coinListPayload,
        getPlatformChainIds(assetPlatformPayload)
      ),
    };

    cachedTopTokenSignals = {
      fetchedAt: Date.now(),
      signals,
    };

    return signals;
  } catch (error: unknown) {
    process.stderr.write(`[tokens] CoinGecko top-token lookup failed: ${error}\n`);
    return null;
  }
}

export async function getTopCoinGeckoSymbols(): Promise<ReadonlySet<string> | null> {
  const signals = await getTopCoinGeckoSignals();
  return signals?.symbols ?? null;
}

export function resetCoinGeckoTopTokensCacheForTests(): void {
  cachedTopTokenSignals = undefined;
}
