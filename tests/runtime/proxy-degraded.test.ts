import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer } from "../../src/runtime/startup.js";

vi.mock("@orbs-network/twap-sdk", () => ({
  Configs: {},
  getConfig: vi.fn().mockReturnValue(undefined),
}));

const mockState = vi.hoisted(() => {
  const config = {
    chainId: 8453,
    privateKey: undefined,
    mnemonic: undefined,
    walletAccountIndex: 0,
    walletAddressIndex: 0,
    rpcUrl: undefined,
    confirmWrites: true,
    confirmTtlMinutes: 30,
    blockscoutMcpUrl: "https://mock.blockscout/mcp",
    etherscanMcpUrl: "https://mock.etherscan/mcp",
    etherscanApiKey: undefined,
    lifiApiKey: undefined,
    zeroxApiKey: undefined,
    coingeckoApiKey: undefined,
  };

  const blockscoutInitialize = vi.fn().mockRejectedValue(new Error("offline"));
  const evmInitialize = vi.fn().mockRejectedValue(new Error("offline"));
  const blockscoutGetTools = vi.fn().mockReturnValue([]);
  const evmGetTools = vi.fn().mockReturnValue([]);
  const proxyStart = vi.fn().mockResolvedValue(undefined);

  return {
    config,
    blockscoutInitialize,
    evmInitialize,
    blockscoutGetTools,
    evmGetTools,
    proxyStart,
    loadQueue: vi.fn().mockResolvedValue(3),
  };
});

vi.mock("../../src/config/env.js", () => ({
  ValidationError: class ValidationError extends Error {},
  parseEnv: vi.fn().mockReturnValue(mockState.config),
  setConfig: vi.fn(),
  getConfig: vi.fn().mockReturnValue(mockState.config),
  BLOCKSCOUT_DEFAULT_URL: "https://mock.blockscout/mcp",
  ETHERSCAN_DEFAULT_URL: "https://mock.etherscan/mcp",
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  initializeWallet: vi.fn().mockResolvedValue(undefined),
  getWalletState: vi.fn().mockReturnValue({
    mode: "read-only",
    chainId: 8453,
    accountIndex: 0,
    addressIndex: 0,
  }),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enabled: true,
    ttlMs: 30 * 60 * 1000,
    loadQueue: (...args: unknown[]) => mockState.loadQueue(...args),
    flushAll: vi.fn().mockReturnValue(0),
    list: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../../src/upstream/blockscout/adapter.js", () => ({
  BlockscoutAdapter: class {
    async initialize(): Promise<void> {
      await mockState.blockscoutInitialize();
    }

    getTools(): unknown[] {
      return mockState.blockscoutGetTools();
    }

    getHealth() {
      return { name: "blockscout", status: "degraded", toolCount: 0 };
    }
  },
}));

vi.mock("../../src/upstream/etherscan/adapter.js", () => ({
  EtherscanAdapter: class {
    async initialize(): Promise<void> {
      // no-op for test mock
    }

    getTools(): unknown[] {
      return [];
    }

    getHealth() {
      return { name: "etherscan", status: "not_configured", toolCount: 0 };
    }
  },
}));

vi.mock("../../src/upstream/evm/adapter.js", () => ({
  EvmAdapter: class {
    async initialize(): Promise<void> {
      await mockState.evmInitialize();
    }

    getTools(): unknown[] {
      return mockState.evmGetTools();
    }

    getHealth() {
      return { name: "evm", status: "degraded", toolCount: 0 };
    }
  },
}));

vi.mock("../../src/goat/provider.js", () => ({
  GoatProvider: class {
    async initialize(): Promise<void> {
      return undefined;
    }
    getAllToolNames(): string[] {
      return ["goat_swap"];
    }
    getReferenceSnapshot() {
      return {
        chainId: 8453,
        listOfTools: [
          {
            name: "goat_swap",
            description: "goat",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        toolHandler: vi.fn(),
      };
    }
    async getOrBuildSnapshot(): Promise<unknown> {
      return undefined;
    }
    async waitForRebuild(): Promise<void> {
      return undefined;
    }
    shutdown(): void {
      // No-op in test mock.
    }
  },
  goatProvider: undefined,
}));

vi.mock("../../src/lifi/config.js", () => ({
  initializeLifi: vi.fn(),
}));

vi.mock("../../src/tools/lifi/index.js", () => ({
  getLifiToolDefinitions: vi.fn().mockReturnValue([
    { name: "lifi_get_quote", category: "swap" },
    { name: "lifi_execute_bridge", category: "swap" },
  ]),
  registerLifiExecutors: vi.fn(),
}));

vi.mock("../../src/tools/orbs/index.js", () => ({
  getOrbsToolDefinitions: vi.fn().mockReturnValue([{ name: "orbs_get_quote", category: "swap" }]),
  registerOrbsExecutors: vi.fn(),
}));

vi.mock("../../src/wallet/events.js", () => ({
  walletEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock("../../src/tools/tokens/index.js", () => ({
  getTokenToolDefinitions: vi.fn().mockReturnValue([{ name: "resolve_token", category: "tokens" }]),
}));

vi.mock("../../src/tools/register.js", () => ({
  getWalletToolDefinitions: vi.fn().mockReturnValue([
    { name: "wallet_generate", category: "wallet" },
    { name: "wallet_get_active", category: "wallet" },
  ]),
  getTransactionToolDefinitions: vi.fn().mockReturnValue([
    { name: "transaction_confirm", category: "transaction" },
    { name: "transaction_list", category: "transaction" },
  ]),
  getUtilityToolDefinitions: vi
    .fn()
    .mockReturnValue([{ name: "server_status", category: "status" }]),
}));

vi.mock("../../src/runtime/server.js", () => ({
  ProxyServer: class {
    async start(): Promise<void> {
      await mockState.proxyStart();
    }

    async shutdown(): Promise<void> {
      /* mock shutdown */
    }
  },
}));

describe("startServer degraded mode", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true as never);
    mockState.blockscoutInitialize.mockClear();
    mockState.evmInitialize.mockClear();
    mockState.proxyStart.mockClear();
  });

  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("completes startup without crashing when upstream adapters fail", async () => {
    await expect(startServer()).resolves.toBeUndefined();
    expect(mockState.blockscoutInitialize).toHaveBeenCalledTimes(1);
    expect(mockState.evmInitialize).toHaveBeenCalledTimes(1);
    expect(mockState.proxyStart).toHaveBeenCalledTimes(1);
  });

  it("logs structured startup block showing adapter statuses", async () => {
    await startServer();

    const output = stderrSpy.mock.calls.map((call) => String(call[0])).join("");

    expect(output).toContain("[web3agent] ─── startup ───");
    expect(output).toContain("chain:");
    expect(output).toContain("wallet:");
    expect(output).toContain("adapters:");
    expect(output).toContain("goat           ok (1 tools)");
    expect(output).toContain("lifi           ok (2 tools)");
    expect(output).toContain("orbs           ok (1 tools)");
    expect(output).toContain("pending-ops:  3 restored");
    expect(output).toContain("[web3agent] ────────────────");
  });
});
