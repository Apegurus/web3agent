import { beforeEach, describe, expect, it, vi } from "vitest";

const resolverMocks = vi.hoisted(() => ({
  resolveToken: vi.fn(),
  listTokens: vi.fn(),
}));

const chainRegistryMocks = vi.hoisted(() => ({
  getChainById: vi.fn(),
}));

vi.mock("../../src/tokens/resolver.js", () => ({
  resolveToken: (...args: unknown[]) => resolverMocks.resolveToken(...args),
  listTokens: (...args: unknown[]) => resolverMocks.listTokens(...args),
}));

vi.mock("../../src/chains/registry.js", () => ({
  getChainById: (...args: unknown[]) => chainRegistryMocks.getChainById(...args),
}));

describe("token tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolve_token returns address and decimals for valid symbol", async () => {
    chainRegistryMocks.getChainById.mockReturnValue({ id: 1, name: "Ethereum" });
    resolverMocks.resolveToken.mockResolvedValue({
      symbol: "USDC",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      chainId: 1,
      source: "registry",
    });

    const { getTokenToolDefinitions } = await import("../../src/tools/tokens/index.js");
    const tool = getTokenToolDefinitions().find((t) => t.name === "resolve_token");
    const result = await tool?.handler({ symbol: "USDC", chainId: 1 });

    expect(result?.isError).toBe(false);
    const payload = JSON.parse((result?.content[0] as { text: string }).text);
    expect(payload.address).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(payload.decimals).toBe(6);
    expect(resolverMocks.resolveToken).toHaveBeenCalledWith("USDC", 1);
  });

  it("resolve_token returns TOKEN_NOT_FOUND for unknown symbol", async () => {
    chainRegistryMocks.getChainById.mockReturnValue({ id: 1, name: "Ethereum" });
    resolverMocks.resolveToken.mockResolvedValue(null);
    resolverMocks.listTokens.mockReturnValue([{ symbol: "USDT" }, { symbol: "USDC" }]);

    const { getTokenToolDefinitions } = await import("../../src/tools/tokens/index.js");
    const tool = getTokenToolDefinitions().find((t) => t.name === "resolve_token");
    const result = await tool?.handler({ symbol: "NOPE", chainId: 1 });

    expect(result?.isError).toBe(true);
    const payload = JSON.parse((result?.content[0] as { text: string }).text);
    expect(payload.error).toBe("TOKEN_NOT_FOUND");
    expect(payload.message).toContain("Known tokens: USDT, USDC");
  });

  it("resolve_token returns UNKNOWN_CHAIN for unsupported chain", async () => {
    chainRegistryMocks.getChainById.mockReturnValue(null);

    const { getTokenToolDefinitions } = await import("../../src/tools/tokens/index.js");
    const tool = getTokenToolDefinitions().find((t) => t.name === "resolve_token");
    const result = await tool?.handler({ symbol: "USDC", chainId: 999999 });

    expect(result?.isError).toBe(true);
    const payload = JSON.parse((result?.content[0] as { text: string }).text);
    expect(payload.error).toBe("UNKNOWN_CHAIN");
  });

  it("list_chain_tokens returns token array for known chain", async () => {
    chainRegistryMocks.getChainById.mockReturnValue({ id: 8453, name: "Base" });
    resolverMocks.listTokens.mockReturnValue([
      { symbol: "USDC", address: "0x1", decimals: 6, name: "USD Coin" },
      { symbol: "WETH", address: "0x2", decimals: 18, name: "Wrapped Ether" },
    ]);

    const { getTokenToolDefinitions } = await import("../../src/tools/tokens/index.js");
    const tool = getTokenToolDefinitions().find((t) => t.name === "list_chain_tokens");
    const result = await tool?.handler({ chainId: 8453 });

    expect(result?.isError).toBe(false);
    const payload = JSON.parse((result?.content[0] as { text: string }).text);
    expect(payload.chainName).toBe("Base");
    expect(payload.tokens).toHaveLength(2);
    expect(payload.tokens[0].symbol).toBe("USDC");
  });

  it("list_chain_tokens returns UNKNOWN_CHAIN for unsupported chain", async () => {
    chainRegistryMocks.getChainById.mockReturnValue(undefined);

    const { getTokenToolDefinitions } = await import("../../src/tools/tokens/index.js");
    const tool = getTokenToolDefinitions().find((t) => t.name === "list_chain_tokens");
    const result = await tool?.handler({ chainId: 777 });

    expect(result?.isError).toBe(true);
    const payload = JSON.parse((result?.content[0] as { text: string }).text);
    expect(payload.error).toBe("UNKNOWN_CHAIN");
  });
});
