import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  getWalletState: vi.fn(),
}));

const confirmationQueueMock = vi.hoisted(() => ({
  enabled: true,
}));

const chainRegistryMocks = vi.hoisted(() => ({
  getChainById: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 8453 }),
  tryGetConfig: vi.fn().mockReturnValue({ chainId: 8453 }),
}));

vi.mock("../../src/wallet/persistence.js", () => persistenceMocks);

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: confirmationQueueMock,
}));

vi.mock("../../src/chains/registry.js", () => ({
  getChainById: (...args: unknown[]) => chainRegistryMocks.getChainById(...args),
}));

vi.mock("../../src/orbs/chains.js", () => ({
  LIQUIDITY_HUB_CHAINS: [1, 8453],
}));

vi.mock("../../src/goat/dispatch.js", () => ({
  RESTRICTED_PLUGIN_CHAINS: {
    uniswap: [1, 8453],
    dexscreener: [8453],
  },
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: (...args: unknown[]) => configMocks.getConfig(...args),
  tryGetConfig: (...args: unknown[]) => configMocks.tryGetConfig(...args),
}));

describe("utility tool handlers", () => {
  const buildHealth = (
    overrides: Partial<Record<string, { name: string; status: string }>> = {}
  ) => ({
    core: "ok" as const,
    explorer: {
      name: "block-explorer",
      status: "ok" as const,
      backends: {
        blockscout: { status: "ok" as const, chainCount: 1 },
        etherscan: { status: "ok" as const, chainCount: 1 },
      },
    },
    blockscout: { name: "blockscout", status: "ok" as const },
    etherscan: { name: "etherscan", status: "ok" as const },
    evm: { name: "evm", status: "ok" as const },
    goat: { name: "goat", status: "ok" as const },
    lifi: { name: "lifi", status: "ok" as const },
    orbs: { name: "orbs", status: "ok" as const },
    ccxt: { name: "ccxt", status: "ok" as const },
    agenticEconomy: { name: "agentic-economy", status: "not_configured" as const },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    confirmationQueueMock.enabled = true;
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
    });
    chainRegistryMocks.getChainById.mockImplementation((chainId: number) => {
      if (chainId === 1) {
        return { id: 1, name: "Ethereum", nativeCurrency: "ETH" };
      }
      if (chainId === 8453) {
        return { id: 8453, name: "Base", nativeCurrency: "ETH" };
      }
      return null;
    });
  });

  it("serverStatus returns wallet mode, chain, confirmations, backends, and tool count", async () => {
    const { serverStatus, setHealthStatus } = await import("../../src/tools/utility/index.js");

    setHealthStatus(
      buildHealth({
        etherscan: { name: "etherscan", status: "degraded" },
        lifi: { name: "lifi", status: "unavailable" },
        orbs: { name: "orbs", status: "not_configured" },
      }),
      88
    );

    const result = await serverStatus();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.walletMode).toBe("read-only");
    expect(payload.activeChainId).toBe(8453);
    expect(payload.confirmWrites).toBe(true);
    expect(payload.toolCount).toBe(88);
    expect(payload.backends).toEqual({
      blockscout: "ok",
      etherscan: "degraded",
      evm: "ok",
      goat: "ok",
      lifi: "unavailable",
      orbs: "not_configured",
      ccxt: "ok",
      agenticEconomy: "not_configured",
    });
  });

  it("serverStatus returns not_initialized when health is not set", async () => {
    const { setHealthStatus } = await import("../../src/tools/utility/index.js");
    setHealthStatus(buildHealth(), 1);

    const utilityModulePath = "../../src/tools/utility/index.js";
    vi.resetModules();
    const { serverStatus: freshServerStatus } = await import(utilityModulePath);
    const result = await freshServerStatus();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.backends.blockscout).toBe("not_initialized");
    expect(payload.backends.orbs).toBe("not_initialized");
    expect(payload.toolCount).toBe(0);
  });

  it("serverStatus does not throw when _health.ccxt is missing (partial health object)", async () => {
    const { serverStatus, setHealthStatus } = await import("../../src/tools/utility/index.js");

    // Build a valid health object, then delete ccxt to simulate a partial/older state.
    const baseHealth = buildHealth();
    const partialHealth = { ...baseHealth };
    // biome-ignore lint/performance/noDelete: simulating missing optional health field
    delete (partialHealth as Partial<typeof partialHealth>).ccxt;
    setHealthStatus(partialHealth as unknown as typeof baseHealth, 1);

    const result = await serverStatus();
    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.backends.ccxt).toBe("not_initialized");
  });

  it("listSupportedChains returns chain entries with id, name, and nativeCurrency", async () => {
    const { listSupportedChains } = await import("../../src/tools/utility/index.js");
    const result = await listSupportedChains();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(Array.isArray(payload.chains)).toBe(true);
    expect(payload.chains).toHaveLength(2);
    expect(payload.chains).toContainEqual({ id: 1, name: "Ethereum", nativeCurrency: "ETH" });
    expect(payload.chains).toContainEqual({ id: 8453, name: "Base", nativeCurrency: "ETH" });
  });

  it("setHealthStatus updates serverStatus health and tool count", async () => {
    const { serverStatus, setHealthStatus } = await import("../../src/tools/utility/index.js");

    setHealthStatus(
      {
        ...buildHealth({
          blockscout: { name: "blockscout", status: "degraded" },
          etherscan: { name: "etherscan", status: "degraded" },
        }),
        core: "degraded",
      },
      42
    );

    const result = await serverStatus();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.backends.blockscout).toBe("degraded");
    expect(payload.toolCount).toBe(42);
  });
});
