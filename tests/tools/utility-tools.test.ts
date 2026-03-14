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
}));

describe("utility tool handlers", () => {
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
      {
        core: "ok",
        blockscout: { name: "blockscout", status: "ok" },
        etherscan: { name: "etherscan", status: "degraded" },
        evm: { name: "evm", status: "ok" },
        goat: { name: "goat", status: "ok" },
        lifi: { name: "lifi", status: "unavailable" },
        orbs: { name: "orbs", status: "not_configured" },
        agenticEconomy: { name: "agentic-economy", status: "not_configured" },
      },
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
      agenticEconomy: "not_configured",
    });
  });

  it("serverStatus returns not_initialized when health is not set", async () => {
    const { setHealthStatus } = await import("../../src/tools/utility/index.js");
    setHealthStatus(
      {
        core: "ok",
        blockscout: { name: "blockscout", status: "ok" },
        etherscan: { name: "etherscan", status: "ok" },
        evm: { name: "evm", status: "ok" },
        goat: { name: "goat", status: "ok" },
        lifi: { name: "lifi", status: "ok" },
        orbs: { name: "orbs", status: "ok" },
        agenticEconomy: { name: "agentic-economy", status: "not_configured" },
      },
      1
    );

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
        core: "degraded",
        blockscout: { name: "blockscout", status: "degraded" },
        etherscan: { name: "etherscan", status: "degraded" },
        evm: { name: "evm", status: "ok" },
        goat: { name: "goat", status: "ok" },
        lifi: { name: "lifi", status: "ok" },
        orbs: { name: "orbs", status: "ok" },
        agenticEconomy: { name: "agentic-economy", status: "not_configured" },
      },
      42
    );

    const result = await serverStatus();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.backends.blockscout).toBe("degraded");
    expect(payload.toolCount).toBe(42);
  });
});
