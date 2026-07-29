import { robinhood } from "viem/chains";
import { describe, expect, it, vi } from "vitest";
import { getChain, isSupportedChain } from "../../src/api/chains.js";
import {
  listChainTokens,
  resolveCanonicalTokenSync as resolveCanonicalApiTokenSync,
  resolveCanonicalToken,
} from "../../src/api/tokens.js";
import { getChainById } from "../../src/chains/registry.js";
import { getSupportTier, isFullySupported } from "../../src/chains/support-tiers.js";
import { getRegisteredChainIds } from "../../src/tokens/registry.js";
import { resolveCanonicalTokenSync as resolveCanonicalRegistryTokenSync } from "../../src/tokens/resolver.js";
import { listSupportedChains } from "../../src/tools/utility/index.js";

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn(),
}));

vi.mock("../../src/goat/dispatch.js", () => ({
  RESTRICTED_PLUGIN_CHAINS: {
    uniswap: [1, 137, 43114, 8453, 10, 42161, 42220],
    balancer: [34443, 8453, 137, 100, 42161, 43114, 10],
  },
}));

vi.mock("../../src/orbs/chains.js", () => ({
  LIQUIDITY_HUB_CHAINS: [137, 56, 146, 8453, 59144, 81457, 42161],
}));

describe("existing chain, token, and support characterization", () => {
  it("preserves the registered chain IDs", () => {
    // Given: the canonical token registry before Robinhood support
    // When: registered chain IDs are listed
    const chainIds = getRegisteredChainIds().filter((chainId) => chainId !== robinhood.id);

    // Then: every existing registry chain remains in its established order
    expect(chainIds).toEqual([
      1, 10, 56, 100, 137, 324, 5000, 8453, 34443, 42161, 42220, 43114, 59144, 81457, 534352,
    ]);
  });

  it("preserves Base native token alias resolution", () => {
    // Given: the established Base native ETH alias
    // When: the canonical resolver receives mixed-case native ETH
    const token = resolveCanonicalRegistryTokenSync("eTh", 8453);

    // Then: it resolves to the existing wrapped ETH metadata
    expect(token).toMatchObject({
      address: "0x4200000000000000000000000000000000000006",
      chainId: 8453,
      decimals: 18,
      source: "registry",
      symbol: "WETH",
    });
  });

  it("preserves established support tier classifications", () => {
    // Given: existing full, partial, and minimal-support chain examples
    // When: their support tiers are classified
    const tiers = [getSupportTier(1), getSupportTier(324), getSupportTier(999_999)];

    // Then: support classification remains stable
    expect(tiers).toEqual(["full", "partial", "minimal"]);
  });

  it("preserves the enhanced MCP status chain set", async () => {
    // Given: the existing enhanced-integration chain status surface
    // When: list_supported_chains is invoked directly
    const result = await listSupportedChains();
    const text = result.content[0];

    // Then: its existing chain IDs remain stable
    expect(result.isError).toBe(false);
    expect(text?.type).toBe("text");
    if (!text || text.type !== "text") return;

    const payload = JSON.parse(text.text) as { chains: { id: number }[] };
    expect(
      payload.chains.filter((chain) => chain.id !== robinhood.id).map((chain) => chain.id)
    ).toEqual([137, 56, 146, 8453, 59144, 81457, 42161, 1, 43114, 10, 42220, 34443, 100]);
  });

  it("preserves viem metadata for Base", () => {
    // Given: the Base chain from viem's registry
    // When: the chain registry is queried
    const base = getChainById(8453);

    // Then: its established canonical identity is unchanged
    expect(base).toMatchObject({
      id: 8453,
      name: "Base",
      nativeCurrency: { decimals: 18, symbol: "ETH" },
    });
  });
});

describe("Robinhood Chain support", () => {
  it("uses viem's official Robinhood definition through chain APIs", () => {
    // Given: viem's published Robinhood Chain definition
    // When: chain APIs resolve its identifier
    const chain = getChainById(robinhood.id);

    // Then: every API returns viem's canonical metadata, not a local chain object
    expect(chain).toEqual(robinhood);
    expect(getChain(robinhood.id)).toEqual(robinhood);
    expect(isSupportedChain(robinhood.id)).toBe(true);
  });

  it("resolves verified Robinhood canonical tokens case-insensitively", () => {
    // Given: documented Robinhood Chain token symbols in mixed case
    // When: canonical registry and root SDK token APIs resolve them
    const eth = resolveCanonicalRegistryTokenSync("eTh", robinhood.id);
    const weth = resolveCanonicalRegistryTokenSync("wEtH", robinhood.id);
    const usdg = resolveCanonicalRegistryTokenSync("uSdG", robinhood.id);
    const aapl = resolveCanonicalRegistryTokenSync("AaPl", robinhood.id);
    const tsla = resolveCanonicalRegistryTokenSync("tSlA", robinhood.id);
    const nvda = resolveCanonicalRegistryTokenSync("NvDa", robinhood.id);
    const tokens = listChainTokens({ chainId: robinhood.id });
    const rootWeth = resolveCanonicalApiTokenSync({ symbol: "WETH", chainId: robinhood.id });

    // Then: native ETH aliases WETH and verified assets retain exact canonical metadata
    expect(eth).toMatchObject({
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      chainId: robinhood.id,
      decimals: 18,
      symbol: "WETH",
    });
    expect(weth).toMatchObject({ symbol: "WETH" });
    expect(usdg).toMatchObject({
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6,
      name: "Global Dollar",
      symbol: "USDG",
    });
    expect(aapl).toMatchObject({
      address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
      decimals: 18,
      symbol: "AAPL",
    });
    expect(tsla).toMatchObject({
      address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
      decimals: 18,
      symbol: "TSLA",
    });
    expect(nvda).toMatchObject({
      address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      decimals: 18,
      symbol: "NVDA",
    });
    expect(tokens).toMatchObject({ chainId: robinhood.id, chainName: robinhood.name });
    expect(tokens.tokens.map((token) => token.symbol)).toEqual(
      expect.arrayContaining(["WETH", "USDG", "AAPL", "TSLA", "NVDA"])
    );
    expect(rootWeth).toMatchObject({ symbol: "WETH" });
  });

  it("reports Robinhood as enhanced via its zeroex and Uniswap v4 capability", () => {
    // Given: Robinhood's verified enhanced-provider capability
    // When: support tier and MCP status are queried
    const tier = getSupportTier(robinhood.id);

    // Then: it is fully supported without adding an Orbs chain entry
    expect(tier).toBe("full");
    expect(isFullySupported(robinhood.id)).toBe(true);
  });

  it("includes Robinhood in the MCP supported-chain status output", async () => {
    // Given: the MCP supported-chain status surface
    // When: enhanced integration chains are listed
    const result = await listSupportedChains();
    const text = result.content[0];

    // Then: Robinhood uses viem's canonical status metadata
    expect(result.isError).toBe(false);
    expect(text?.type).toBe("text");
    if (!text || text.type !== "text") return;

    const payload = JSON.parse(text.text) as { chains: unknown[] };
    expect(payload.chains).toContainEqual({
      id: robinhood.id,
      name: robinhood.name,
      nativeCurrency: robinhood.nativeCurrency,
    });
  });

  it("retains typed failures for invalid chains and forged stock symbols", async () => {
    // Given: an invalid chain and an unregistered stock-like symbol
    // When: public token APIs receive the invalid inputs
    // Then: errors retain their established typed failure codes without fabricating metadata
    await expect(
      resolveCanonicalToken({ symbol: "WETH", chainId: 2_147_483_647 })
    ).rejects.toMatchObject({ code: "UNKNOWN_CHAIN" });
    await expect(
      resolveCanonicalToken({ symbol: "FAKESTOCK", chainId: robinhood.id })
    ).rejects.toMatchObject({ code: "TOKEN_NOT_FOUND" });
  });
});
