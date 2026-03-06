import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoatProvider } from "../../src/goat/provider.js";

let mockChainIdFromWallet = 1;

vi.mock("@goat-sdk/adapter-model-context-protocol", () => ({
	getOnChainTools: vi.fn().mockImplementation(({ wallet }) => {
		const chainId = wallet.__testChainId ?? 0;
		return {
			listOfTools: () => [
				{
					name: "get_balance",
					description: "Get balance",
					inputSchema: { type: "object" },
				},
			],
			toolHandler: vi
				.fn()
				.mockImplementation(async (name: string, _params: unknown) => ({
					content: [
						{ type: "text", text: `called ${name} on chain ${chainId}` },
					],
				})),
		};
	}),
}));

vi.mock("@goat-sdk/wallet-viem", () => ({
	viem: vi.fn().mockImplementation((client) => ({
		...client,
		__testChainId: client.chain?.id,
	})),
}));

vi.mock("@goat-sdk/plugin-erc20", () => ({
	erc20: vi.fn().mockReturnValue({ name: "erc20" }),
	USDC: {},
	WETH: {},
}));
vi.mock("@goat-sdk/plugin-erc721", () => ({
	erc721: vi.fn().mockReturnValue({}),
	BAYC: {},
	CRYPTOPUNKS: {},
}));
vi.mock("@goat-sdk/plugin-ens", () => ({
	ens: vi.fn().mockReturnValue({}),
}));
vi.mock("@goat-sdk/plugin-dexscreener", () => ({
	dexscreener: vi.fn().mockReturnValue({}),
}));
vi.mock("@goat-sdk/plugin-coingecko", () => ({
	coingecko: vi.fn().mockReturnValue({}),
}));
vi.mock("@goat-sdk/plugin-uniswap", () => ({
	uniswap: vi.fn().mockReturnValue({}),
}));
vi.mock("@goat-sdk/plugin-balancer", () => ({
	balancer: vi.fn().mockReturnValue({}),
}));
vi.mock("@goat-sdk/plugin-0x", () => ({
	zeroEx: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
	getWalletState: vi.fn().mockReturnValue({ mode: "read-only" }),
	getActiveAccount: vi.fn(),
}));

vi.mock("../../src/config/wallet-factory.js", () => ({
	createWalletClientForChain: vi
		.fn()
		.mockImplementation((_account, chainId) => ({
			chain: { id: chainId },
		})),
}));

vi.mock("../../src/chains/registry.js", () => ({
	getAllChains: vi.fn().mockReturnValue([
		{ id: 1, name: "Ethereum" },
		{ id: 8453, name: "Base" },
		{ id: 137, name: "Polygon" },
	]),
	SUPPORTED_CHAIN_IDS: [1, 8453, 137],
}));

describe("GoatProvider — chain-aware dispatch", () => {
	it("builds snapshot for different chains", async () => {
		const provider = new GoatProvider();
		await provider.initialize({});

		const snapshot8453 = provider.getSnapshot(8453);
		const snapshot1 = provider.getSnapshot(1);

		expect(snapshot8453).toBeDefined();
		expect(snapshot1).toBeDefined();
		expect(snapshot8453?.chainId).toBe(8453);
		expect(snapshot1?.chainId).toBe(1);
	});

	it("same tool routes to different handlers by chainId", async () => {
		const provider = new GoatProvider();
		await provider.initialize({});

		const snapshot1 = provider.getSnapshot(1);
		const snapshot8453 = provider.getSnapshot(8453);

		const result1 = await snapshot1!.toolHandler("get_balance", {});
		const result8453 = await snapshot8453!.toolHandler("get_balance", {});

		expect(result1.content[0].text).toContain("chain 1");
		expect(result8453.content[0].text).toContain("chain 8453");
	});

	it("exposes tool names from all chains (deduplicated)", async () => {
		const provider = new GoatProvider();
		await provider.initialize({});

		const names = provider.getAllToolNames();
		expect(names).toContain("get_balance");
		expect(names.filter((n) => n === "get_balance")).toHaveLength(1);
	});

	it("returns undefined for chain without snapshot", async () => {
		const provider = new GoatProvider();
		await provider.initialize({});

		expect(provider.getSnapshot(999)).toBeUndefined();
	});

	it("reports loaded plugins", async () => {
		const provider = new GoatProvider();
		await provider.initialize({});

		const plugins = provider.getLoadedPlugins();
		expect(plugins).toContain("erc20");
		expect(plugins).toContain("dexscreener");
	});
});
