import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@goat-sdk/plugin-erc20", () => ({
  erc20: vi.fn(),
  USDC: { symbol: "USDC" },
  WETH: { symbol: "WETH" },
}));

vi.mock("@goat-sdk/plugin-ens", () => ({
  ens: vi.fn(),
}));

vi.mock("@goat-sdk/plugin-erc721", () => ({
  erc721: vi.fn(),
  BAYC: { symbol: "BAYC" },
  CRYPTOPUNKS: { symbol: "CRYPTOPUNKS" },
}));

vi.mock("@goat-sdk/plugin-dexscreener", () => ({
  dexscreener: vi.fn(),
}));

vi.mock("@goat-sdk/plugin-uniswap", () => ({
  uniswap: vi.fn(),
}));

vi.mock("@goat-sdk/plugin-balancer", () => ({
  balancer: vi.fn(),
}));

vi.mock("@goat-sdk/plugin-coingecko", () => ({
  coingecko: vi.fn(),
}));

vi.mock("@goat-sdk/plugin-0x", () => ({
  zeroEx: vi.fn(),
}));

import { zeroEx } from "@goat-sdk/plugin-0x";
import { balancer } from "@goat-sdk/plugin-balancer";
import { coingecko } from "@goat-sdk/plugin-coingecko";
import { dexscreener } from "@goat-sdk/plugin-dexscreener";
import { ens } from "@goat-sdk/plugin-ens";
import { erc20 } from "@goat-sdk/plugin-erc20";
import { erc721 } from "@goat-sdk/plugin-erc721";
import { uniswap } from "@goat-sdk/plugin-uniswap";
import { loadPlugins } from "../../src/goat/plugins.js";

const mockErc20 = vi.mocked(erc20);
const mockErc721 = vi.mocked(erc721);
const mockEns = vi.mocked(ens);
const mockDexscreener = vi.mocked(dexscreener);
const mockUniswap = vi.mocked(uniswap);
const mockBalancer = vi.mocked(balancer);
const mockCoingecko = vi.mocked(coingecko);
const mockZeroEx = vi.mocked(zeroEx);

describe("loadPlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockErc20.mockImplementation(() => ({ name: "erc20" }) as ReturnType<typeof erc20>);
    mockErc721.mockImplementation(() => ({ name: "erc721" }) as ReturnType<typeof erc721>);
    mockEns.mockImplementation(() => ({ name: "ens" }) as ReturnType<typeof ens>);
    mockDexscreener.mockImplementation(
      () => ({ name: "dexscreener" }) as ReturnType<typeof dexscreener>
    );
    mockUniswap.mockImplementation(() => ({ name: "uniswap" }) as ReturnType<typeof uniswap>);
    mockBalancer.mockImplementation(() => ({ name: "balancer" }) as ReturnType<typeof balancer>);
    mockCoingecko.mockImplementation(() => ({ name: "coingecko" }) as ReturnType<typeof coingecko>);
    mockZeroEx.mockImplementation(() => ({ name: "0x" }) as ReturnType<typeof zeroEx>);
  });

  it("loads only tier0 plugins when optional keys are not provided", () => {
    const result = loadPlugins({ hasWallet: false });

    expect(result.loadedTier0).toEqual(["erc20", "erc721", "ens", "dexscreener"]);
    expect(result.loadedTier1).toEqual([]);
    expect(result.loadedTier2).toEqual([]);
    expect(result.failedPlugins).toEqual([]);
    expect(result.plugins).toHaveLength(4);
  });

  it("loads 0x plugin when zeroxApiKey is provided", () => {
    const result = loadPlugins({ hasWallet: false, zeroxApiKey: "zeroex-key" });

    expect(result.loadedTier2).toContain("0x");
    expect(result.failedPlugins).toEqual([]);
    expect(mockZeroEx).toHaveBeenCalledWith({ apiKey: "zeroex-key" });
  });

  it("loads coingecko plugin when coingeckoApiKey is provided", () => {
    const result = loadPlugins({ hasWallet: false, coingeckoApiKey: "cg-key" });

    expect(result.loadedTier2).toContain("coingecko");
    expect(result.failedPlugins).toEqual([]);
    expect(mockCoingecko).toHaveBeenCalledWith({ apiKey: "cg-key" });
  });

  it("skips wallet tier plugins in read-only mode", () => {
    const result = loadPlugins({
      hasWallet: false,
      coingeckoApiKey: "cg-key",
      zeroxApiKey: "zeroex-key",
    });

    expect(result.loadedTier1).toEqual([]);
    expect(result.loadedTier2).toEqual(["coingecko", "0x"]);
    expect(mockUniswap).not.toHaveBeenCalled();
    expect(mockBalancer).not.toHaveBeenCalled();
  });

  it("catches plugin factory errors and continues loading", () => {
    mockEns.mockImplementation(() => {
      throw new Error("ens unavailable");
    });

    const result = loadPlugins({
      hasWallet: true,
      coingeckoApiKey: "cg-key",
      zeroxApiKey: "zeroex-key",
      rpcUrl: "https://rpc.example",
    });

    expect(result.failedPlugins).toEqual([
      {
        name: "ens",
        error: expect.stringContaining("ens unavailable"),
      },
    ]);
    expect(result.loadedTier0).toEqual(["erc20", "erc721", "dexscreener"]);
    expect(result.loadedTier1).toEqual(["uniswap", "balancer"]);
    expect(result.loadedTier2).toEqual(["coingecko", "0x"]);
    expect(result.plugins).toHaveLength(7);
  });

  it("loads every plugin when all conditions are satisfied", () => {
    const result = loadPlugins({
      hasWallet: true,
      coingeckoApiKey: "cg-key",
      zeroxApiKey: "zeroex-key",
      rpcUrl: "https://rpc.example",
    });

    expect(result.loadedTier0).toEqual(["erc20", "erc721", "ens", "dexscreener"]);
    expect(result.loadedTier1).toEqual(["uniswap", "balancer"]);
    expect(result.loadedTier2).toEqual(["coingecko", "0x"]);
    expect(result.failedPlugins).toEqual([]);
    expect(result.plugins).toHaveLength(8);
  });

  it("returns all expected array fields", () => {
    const result = loadPlugins({ hasWallet: false });

    expect(Array.isArray(result.loadedTier0)).toBe(true);
    expect(Array.isArray(result.loadedTier1)).toBe(true);
    expect(Array.isArray(result.loadedTier2)).toBe(true);
    expect(Array.isArray(result.failedPlugins)).toBe(true);
  });
});
