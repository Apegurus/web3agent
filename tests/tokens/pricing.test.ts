import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../src/utils/resilient-fetch.js", () => ({
	resilientFetch: mockResilientFetch,
}));

vi.mock("../../src/tokens/coingecko.js", () => ({
	getTokenPriceUrl: vi.fn().mockReturnValue("https://api.coingecko.com/api/v3"),
	getTokenPriceHeaders: vi.fn().mockReturnValue({}),
	FALLBACK_PLATFORM_CHAIN_IDS: {
		ethereum: 1,
		"binance-smart-chain": 56,
		"polygon-pos": 137,
		"arbitrum-one": 42161,
		base: 8453,
	},
}));

import { estimateTokenUsd, getTokenPriceUsd, resetPriceCache } from "../../src/tokens/pricing.js";

beforeEach(() => {
	resetPriceCache();
	mockResilientFetch.mockReset();
});

describe("getTokenPriceUsd", () => {
	it("returns ~1.0 for known stablecoins without network call", async () => {
		// USDC on Ethereum — resolved via registry symbol lookup
		const price = await getTokenPriceUsd("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1);
		expect(price).toBe(1.0);
		expect(mockResilientFetch).not.toHaveBeenCalled();
	});

	it("fetches price from CoinGecko for non-stablecoin", async () => {
		mockResilientFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 7.42 } }),
				{ status: 200 },
			),
		);
		const price = await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
		expect(price).toBe(7.42);
	});

	it("returns cached price on second call within TTL", async () => {
		mockResilientFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 7.42 } }),
				{ status: 200 },
			),
		);
		await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
		const price = await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
		expect(price).toBe(7.42);
		expect(mockResilientFetch).toHaveBeenCalledTimes(1);
	});

	it("falls back to DexScreener when CoinGecko fails", async () => {
		mockResilientFetch
			.mockResolvedValueOnce(new Response("error", { status: 500 })) // CoinGecko
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ pairs: [{ priceUsd: "3.50", chainId: "ethereum" }] }),
					{ status: 200 },
				),
			); // DexScreener
		const price = await getTokenPriceUsd("0xunknowntoken", 1);
		expect(price).toBe(3.5);
	});

	it("returns null when both sources fail", async () => {
		mockResilientFetch.mockResolvedValue(new Response("error", { status: 500 }));
		const price = await getTokenPriceUsd("0xunknowntoken", 1);
		expect(price).toBeNull();
	});

	it("returns null for unsupported chainId", async () => {
		const price = await getTokenPriceUsd("0xsomething", 999999);
		expect(price).toBeNull();
	});
});

describe("estimateTokenUsd", () => {
	it("converts raw amount to USD using price and decimals", async () => {
		mockResilientFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 10.0 } }),
				{ status: 200 },
			),
		);
		const usd = await estimateTokenUsd(
			"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
			1,
			"1500000000000000000",
			18,
		);
		expect(usd).toBe(15.0);
	});

	it("handles 6-decimal stablecoin (USDC)", async () => {
		const usd = await estimateTokenUsd(
			"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
			1,
			"1000000",
			6,
		);
		expect(usd).toBe(1.0);
	});

	it("returns null when price unavailable", async () => {
		mockResilientFetch.mockResolvedValue(new Response("error", { status: 500 }));
		const usd = await estimateTokenUsd("0xunknown", 999999, "1000000000000000000", 18);
		expect(usd).toBeNull();
	});
});
