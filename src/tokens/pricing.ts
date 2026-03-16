import { resilientFetch } from "../utils/resilient-fetch.js";
import {
	FALLBACK_PLATFORM_CHAIN_IDS,
	getTokenPriceHeaders,
	getTokenPriceUrl,
} from "./coingecko.js";
import { lookupTokenByAddress } from "./registry.js";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Internal-only cache type — not a tool schema, no Zod needed
interface CachedPrice {
	priceUsd: number;
	fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();

function cacheKey(address: string, chainId: number): string {
	return `${chainId}:${address.toLowerCase()}`;
}

// Stablecoin symbols — treat as $1.00
const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDbC", "BUSD", "USDB"]);

// Invert FALLBACK_PLATFORM_CHAIN_IDS: chainId → platform string
const CHAIN_TO_PLATFORM: Record<number, string> = {};
for (const [platform, chainId] of Object.entries(FALLBACK_PLATFORM_CHAIN_IDS)) {
	CHAIN_TO_PLATFORM[chainId] = platform;
}

// DexScreener chain slugs by chainId
const DEXSCREENER_CHAINS: Record<number, string> = {
	1: "ethereum",
	56: "bsc",
	137: "polygon",
	42161: "arbitrum",
	10: "optimism",
	8453: "base",
	59144: "linea",
	43114: "avalanche",
	81457: "blast",
	324: "zksync",
	534352: "scroll",
	100: "gnosischain",
	42220: "celo",
	5000: "mantle",
	34443: "mode",
};

// Native token sentinel addresses
const NATIVE_ADDRESSES = new Set([
	"0x0000000000000000000000000000000000000000",
	"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	"0x0000000000000000000000000000000000001010",
]);

// Wrapped native tokens per chain (lowercased)
const WRAPPED_NATIVE: Record<number, string> = {
	1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
	137: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
	56: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
	8453: "0x4200000000000000000000000000000000000006",
	42161: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
	10: "0x4200000000000000000000000000000000000006",
	43114: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
};

function isStablecoin(address: string, chainId: number): boolean {
	const entry = lookupTokenByAddress(address, chainId);
	return entry !== undefined && STABLECOIN_SYMBOLS.has(entry.symbol);
}

function resolveNativeToWrapped(address: string, chainId: number): string | null {
	if (!NATIVE_ADDRESSES.has(address.toLowerCase())) return null;
	return WRAPPED_NATIVE[chainId] ?? null;
}

export async function getTokenPriceUsd(
	address: string,
	chainId: number,
): Promise<number | null> {
	const normalizedAddress = address.toLowerCase();

	// Handle native token → wrapped
	const wrappedAddress = resolveNativeToWrapped(normalizedAddress, chainId);
	const lookupAddress = wrappedAddress ?? normalizedAddress;

	// Stablecoin short-circuit
	if (isStablecoin(lookupAddress, chainId)) return 1.0;

	// Check cache
	const key = cacheKey(lookupAddress, chainId);
	const cached = priceCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
		return cached.priceUsd;
	}

	// Try CoinGecko
	const price = await fetchCoinGeckoTokenPrice(lookupAddress, chainId);
	if (price !== null) {
		priceCache.set(key, { priceUsd: price, fetchedAt: Date.now() });
		return price;
	}

	// Fall back to DexScreener
	const dexPrice = await fetchDexScreenerPrice(lookupAddress, chainId);
	if (dexPrice !== null) {
		priceCache.set(key, { priceUsd: dexPrice, fetchedAt: Date.now() });
		return dexPrice;
	}

	return null;
}

export async function estimateTokenUsd(
	address: string,
	chainId: number,
	amountRaw: string,
	decimals: number,
): Promise<number | null> {
	const price = await getTokenPriceUsd(address, chainId);
	if (price === null) return null;

	const amount = Number(amountRaw) / 10 ** decimals;
	return amount * price;
}

async function fetchCoinGeckoTokenPrice(
	address: string,
	chainId: number,
): Promise<number | null> {
	const platform = CHAIN_TO_PLATFORM[chainId];
	if (!platform) return null;

	try {
		const baseUrl = getTokenPriceUrl();
		const url = `${baseUrl}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd`;
		const response = await resilientFetch(
			url,
			{ headers: getTokenPriceHeaders() },
			{
				label: "coingecko-token-price",
				retry: { maxRetries: 1 },
				timeoutMs: 10_000,
			},
		);
		if (!response.ok) return null;

		const data = (await response.json()) as Record<string, { usd?: number }>;
		return data[address]?.usd ?? null;
	} catch (e: unknown) {
		process.stderr.write(`[tokens] CoinGecko token price failed for ${address}: ${e}\n`);
		return null;
	}
}

async function fetchDexScreenerPrice(
	address: string,
	chainId: number,
): Promise<number | null> {
	const expectedChain = DEXSCREENER_CHAINS[chainId];
	if (!expectedChain) return null;

	try {
		const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
		const response = await resilientFetch(url, undefined, {
			label: "dexscreener-price",
			retry: { maxRetries: 1 },
			timeoutMs: 10_000,
		});
		if (!response.ok) return null;

		const data = (await response.json()) as {
			pairs?: Array<{ priceUsd?: string; chainId?: string }>;
		};
		const pair = data.pairs?.find((p) => p.chainId === expectedChain);
		if (!pair?.priceUsd) return null;

		const price = Number(pair.priceUsd);
		return Number.isNaN(price) ? null : price;
	} catch (e: unknown) {
		process.stderr.write(`[tokens] DexScreener price failed for ${address}: ${e}\n`);
		return null;
	}
}

export function resetPriceCache(): void {
	priceCache.clear();
}
