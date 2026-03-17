import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const goatProviders: Array<{
    config?: { chainId: number };
    initialize: ReturnType<typeof vi.fn>;
    getReferenceSnapshot: ReturnType<typeof vi.fn>;
    getAllToolNames: ReturnType<typeof vi.fn>;
    getOrBuildSnapshot: ReturnType<typeof vi.fn>;
    waitForRebuild: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    goatProviders,
    dispatchGoatTool: vi.fn(),
    initializeWallet: vi.fn().mockResolvedValue(undefined),
    getWalletState: vi.fn().mockReturnValue({
      mode: "read-only",
      address: "0xabc",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    }),
    registerOrbsExecutors: vi.fn(),
    registerLifiExecutors: vi.fn(),
    registerEvmExecutors: vi.fn(),
    initializeLifi: vi.fn(),
    setHealthStatus: vi.fn(),
    loadQueue: vi.fn().mockResolvedValue(2),
    flushAll: vi.fn().mockReturnValue(0),
    listQueue: vi.fn().mockReturnValue([]),
    blockscoutShutdown: vi.fn().mockResolvedValue(undefined),
    etherscanShutdown: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/wallet/persistence.js", () => ({
  initializeWallet: (...args: unknown[]) => mockState.initializeWallet(...args),
  getWalletState: (...args: unknown[]) => mockState.getWalletState(...args),
}));

vi.mock("../../src/tools/orbs/index.js", () => ({
  getOrbsToolDefinitions: vi.fn().mockReturnValue([]),
  registerOrbsExecutors: (...args: unknown[]) => mockState.registerOrbsExecutors(...args),
}));

vi.mock("../../src/tools/lifi/index.js", () => ({
  getLifiToolDefinitions: vi.fn().mockReturnValue([]),
  registerLifiExecutors: (...args: unknown[]) => mockState.registerLifiExecutors(...args),
}));

vi.mock("../../src/tools/evm/index.js", () => ({
  getEvmToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "evm_get_balance",
      category: "evm",
      description: "evm",
      inputSchema: { type: "object", properties: {} },
      handler: vi.fn().mockResolvedValue({ isError: false, content: [] }),
    },
  ]),
  registerEvmExecutors: (...args: unknown[]) => mockState.registerEvmExecutors(...args),
}));

vi.mock("../../src/tools/register.js", () => ({
  getWalletToolDefinitions: vi.fn().mockReturnValue([]),
  getTransactionToolDefinitions: vi.fn().mockReturnValue([]),
  getUtilityToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/tokens/index.js", () => ({
  getTokenToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/market/index.js", () => ({
  getMarketToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/utility/index.js", () => ({
  setHealthStatus: (...args: unknown[]) => mockState.setHealthStatus(...args),
}));

vi.mock("../../src/lifi/config.js", () => ({
  initializeLifi: (...args: unknown[]) => mockState.initializeLifi(...args),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enabled: true,
    ttlMs: 30 * 60 * 1000,
    loadQueue: (...args: unknown[]) => mockState.loadQueue(...args),
    flushAll: (...args: unknown[]) => mockState.flushAll(...args),
    list: (...args: unknown[]) => mockState.listQueue(...args),
  },
  registerExecutor: vi.fn(),
}));

vi.mock("../../src/wallet/events.js", () => ({
  walletEvents: {
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("../../src/goat/dispatch.js", () => ({
  RESTRICTED_PLUGIN_CHAINS: {
    uniswap: [1, 137, 43114, 8453, 10, 42161, 42220],
  },
  dispatchGoatTool: (...args: unknown[]) => mockState.dispatchGoatTool(...args),
}));

vi.mock("../../src/goat/provider.js", () => {
  class GoatProvider {
    private readonly state = {
      config: undefined as { chainId: number } | undefined,
      initialize: vi.fn(async (config: { chainId: number }) => {
        this.state.config = config;
      }),
      getReferenceSnapshot: vi.fn(() => ({
        chainId: this.state.config?.chainId ?? 1,
        listOfTools: [
          {
            name: "uniswap_swap",
            description: "Swap via Uniswap",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        toolHandler: vi.fn(),
      })),
      getAllToolNames: vi.fn(() => ["uniswap_swap"]),
      getOrBuildSnapshot: vi.fn(async (chainId: number) => ({
        chainId,
        listOfTools: [],
        toolHandler: vi.fn(),
      })),
      waitForRebuild: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    };

    constructor() {
      mockState.goatProviders.push(this.state);
    }

    async initialize(config: { chainId: number }): Promise<void> {
      await this.state.initialize(config);
    }

    getReferenceSnapshot() {
      return this.state.getReferenceSnapshot();
    }

    getAllToolNames(): string[] {
      return this.state.getAllToolNames();
    }

    async getOrBuildSnapshot(chainId: number) {
      return this.state.getOrBuildSnapshot(chainId);
    }

    async waitForRebuild(): Promise<void> {
      await this.state.waitForRebuild();
    }

    shutdown(): void {
      this.state.shutdown();
    }
  }

  return {
    GoatProvider,
    goatProvider: undefined,
  };
});

vi.mock("../../src/upstream/blockscout/adapter.js", () => ({
  BlockscoutAdapter: class {
    async initialize(): Promise<void> {
      return undefined;
    }
    getTools(): unknown[] {
      return [];
    }
    getHealth() {
      return { name: "blockscout", status: "ok", toolCount: 0 };
    }
    async shutdown(): Promise<void> {
      await mockState.blockscoutShutdown();
    }
  },
}));

vi.mock("../../src/upstream/etherscan/adapter.js", () => ({
  EtherscanAdapter: class {
    async initialize(): Promise<void> {
      return undefined;
    }
    getTools(): unknown[] {
      return [];
    }
    getHealth() {
      return { name: "etherscan", status: "ok", toolCount: 0 };
    }
    async shutdown(): Promise<void> {
      await mockState.etherscanShutdown();
    }
  },
}));

describe("managed runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.goatProviders.length = 0;
    mockState.dispatchGoatTool.mockReset().mockResolvedValue({
      isError: false,
      structuredContent: { ok: true, data: { status: "ok" } },
      content: [{ type: "text", text: '{"status":"ok"}' }],
    });
    mockState.initializeWallet.mockClear();
    mockState.registerOrbsExecutors.mockClear();
    mockState.registerLifiExecutors.mockClear();
    mockState.registerEvmExecutors.mockClear();
    mockState.initializeLifi.mockClear();
    mockState.setHealthStatus.mockClear();
    mockState.loadQueue.mockReset().mockResolvedValue(2);
    mockState.flushAll.mockReset().mockReturnValue(0);
    mockState.listQueue.mockReset().mockReturnValue([]);
    mockState.blockscoutShutdown.mockClear();
    mockState.etherscanShutdown.mockClear();
  });

  it("uses a runtime-local goat provider and config for goat dispatch", async () => {
    const { createRuntime } = await import("../../src/runtime/managed-runtime.js");

    const runtimeA = await createRuntime({
      config: {
        chainId: 1,
        privateKey: undefined,
        mnemonic: undefined,
        walletAccountIndex: 0,
        walletAddressIndex: 0,
        rpcUrl: undefined,
        chainRpcUrls: {},
        confirmWrites: true,
        confirmTtlMinutes: 30,
        blockscoutMcpUrl: "https://blockscout-a",
        etherscanMcpUrl: "https://etherscan-a",
        etherscanApiKey: undefined,
        lifiApiKey: undefined,
        zeroxApiKey: undefined,
        coingeckoApiKey: undefined,
        orbsPartner: undefined,
      },
    });
    const runtimeB = await createRuntime({
      config: {
        chainId: 8453,
        privateKey: undefined,
        mnemonic: undefined,
        walletAccountIndex: 0,
        walletAddressIndex: 0,
        rpcUrl: undefined,
        chainRpcUrls: {},
        confirmWrites: true,
        confirmTtlMinutes: 30,
        blockscoutMcpUrl: "https://blockscout-b",
        etherscanMcpUrl: "https://etherscan-b",
        etherscanApiKey: undefined,
        lifiApiKey: undefined,
        zeroxApiKey: undefined,
        coingeckoApiKey: undefined,
        orbsPartner: undefined,
      },
    });

    await runtimeA.invokeTool("uniswap_swap");
    await runtimeB.invokeTool("uniswap_swap");

    const firstOptions = mockState.dispatchGoatTool.mock.calls[0]?.[2] as {
      config: { chainId: number };
      goatProvider: unknown;
    };
    const secondOptions = mockState.dispatchGoatTool.mock.calls[1]?.[2] as {
      config: { chainId: number };
      goatProvider: unknown;
    };

    expect(firstOptions.config.chainId).toBe(1);
    expect(secondOptions.config.chainId).toBe(8453);
    expect(firstOptions.goatProvider).not.toBe(secondOptions.goatProvider);

    await runtimeA.shutdown();
    expect(mockState.goatProviders[0]?.shutdown).toHaveBeenCalledTimes(1);
    expect(mockState.goatProviders[1]?.shutdown).not.toHaveBeenCalled();

    await runtimeB.shutdown();
    expect(mockState.goatProviders[1]?.shutdown).toHaveBeenCalledTimes(1);
  });

  it("surfaces restored queue count and goat chain restrictions in managed tool metadata", async () => {
    const { createRuntime } = await import("../../src/runtime/managed-runtime.js");

    const runtime = await createRuntime({
      config: {
        chainId: 1,
        privateKey: undefined,
        mnemonic: undefined,
        walletAccountIndex: 0,
        walletAddressIndex: 0,
        rpcUrl: undefined,
        chainRpcUrls: {},
        confirmWrites: true,
        confirmTtlMinutes: 30,
        blockscoutMcpUrl: "https://blockscout",
        etherscanMcpUrl: "https://etherscan",
        etherscanApiKey: undefined,
        lifiApiKey: undefined,
        zeroxApiKey: undefined,
        coingeckoApiKey: undefined,
        orbsPartner: undefined,
      },
    });

    expect(runtime.pendingOpsRestored).toBe(2);

    const goatTool = runtime.getTool("uniswap_swap");
    const operationPrepareTool = runtime.getTool("operation_prepare");
    const operationResumeTool = runtime.getTool("operation_resume");
    expect(goatTool?.description).toContain("Only available on chains:");
    expect(goatTool?.inputSchema.properties).toHaveProperty("chainId");
    expect(operationPrepareTool?.category).toBe("operation");
    expect(operationPrepareTool?.source).toBe("operation");
    expect(operationResumeTool?.category).toBe("operation");

    await runtime.shutdown();
  });
});
