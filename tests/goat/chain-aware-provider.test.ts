import { describe, expect, it, vi } from "vitest";
import { GoatProvider } from "../../src/goat/provider.js";

vi.mock("../../src/goat/toolset.js", () => ({
  buildGoatTools: vi.fn().mockResolvedValue([
    {
      name: "get_balance",
      description: "Get balance",
      parameters: {
        parse: (input: unknown) => input ?? {},
      },
      execute: vi.fn(),
    },
  ]),
  createGoatToolSnapshot: vi.fn().mockImplementation((chainId: number) => ({
    listOfTools: [
      {
        name: "get_balance",
        description: "Get balance",
        inputSchema: { type: "object" },
      },
    ],
    toolHandler: vi.fn().mockImplementation(async (name: string, _params: unknown) => ({
      content: [{ type: "text", text: `called ${name} on chain ${chainId}` }],
    })),
    chainId,
  })),
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
  getWalletState: vi.fn().mockReturnValue({ mode: "read-only", chainId: 8453 }),
  getActiveAccount: vi.fn(),
}));

vi.mock("../../src/config/wallet-factory.js", () => ({
  createWalletClientForChain: vi.fn().mockImplementation((_account, chainId) => ({
    chain: { id: chainId },
  })),
}));

describe("GoatProvider — chain-aware dispatch", () => {
  const runtimeConfig = {
    chainId: 8453,
    privateKey: undefined,
    mnemonic: undefined,
    walletAccountIndex: 0,
    walletAddressIndex: 0,
    rpcUrl: undefined,
    chainRpcUrls: {},
    confirmWrites: true,
    confirmTtlMinutes: 30,
    blockscoutMcpUrl: "https://blockscout.mock",
    etherscanMcpUrl: "https://etherscan.mock",
    etherscanApiKey: undefined,
    lifiApiKey: undefined,
    zeroxApiKey: undefined,
    coingeckoApiKey: undefined,
    orbsPartner: undefined,
  };

  it("builds snapshot on-demand for different chains", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const snapshot8453 = await provider.getOrBuildSnapshot(8453);
    const snapshot1 = await provider.getOrBuildSnapshot(1);

    expect(snapshot8453).toBeDefined();
    expect(snapshot1).toBeDefined();
    expect(snapshot8453?.chainId).toBe(8453);
    expect(snapshot1?.chainId).toBe(1);
  });

  it("same tool routes to different handlers by chainId", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const snapshot1 = await provider.getOrBuildSnapshot(1);
    const snapshot8453 = await provider.getOrBuildSnapshot(8453);

    const result1 = await snapshot1?.toolHandler("get_balance", {});
    const result8453 = await snapshot8453?.toolHandler("get_balance", {});

    expect(result1?.content[0].text).toContain("chain 1");
    expect(result8453?.content[0].text).toContain("chain 8453");
  });

  it("exposes tool names from reference snapshot", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const names = provider.getAllToolNames();
    expect(names).toContain("get_balance");
    expect(names.filter((n) => n === "get_balance")).toHaveLength(1);
  });

  it("getReferenceSnapshot returns the default chain snapshot", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const ref = provider.getReferenceSnapshot();
    expect(ref).toBeDefined();
    expect(ref?.chainId).toBe(8453);
  });

  it("caches snapshots and returns same instance on repeated calls", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const first = await provider.getOrBuildSnapshot(137);
    const second = await provider.getOrBuildSnapshot(137);
    expect(first).toBe(second);
  });

  it("reports loaded plugins", async () => {
    const provider = new GoatProvider();
    await provider.initialize(runtimeConfig);

    const plugins = provider.getLoadedPlugins();
    expect(plugins).toContain("erc20");
    expect(plugins).toContain("dexscreener");
  });
});
