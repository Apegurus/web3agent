import { beforeEach, describe, expect, it, vi } from "vitest";
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
    blockscoutMcpUrl: "https://mock.blockscout/mcp",
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
  };
});

vi.mock("../../src/config/env.js", () => ({
  ValidationError: class ValidationError extends Error {},
  parseEnv: vi.fn().mockReturnValue(mockState.config),
  getConfig: vi.fn().mockReturnValue(mockState.config),
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
  goatProvider: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllToolNames: vi.fn().mockReturnValue(["goat_swap"]),
  },
}));

vi.mock("../../src/lifi/config.js", () => ({
  initializeLifi: vi.fn(),
}));

vi.mock("../../src/tools/lifi/index.js", () => ({
  getLifiToolDefinitions: vi
    .fn()
    .mockReturnValue([{ name: "lifi_get_quote" }, { name: "lifi_execute_bridge" }]),
}));

vi.mock("../../src/tools/orbs/index.js", () => ({
  getOrbsToolDefinitions: vi.fn().mockReturnValue([{ name: "orbs_get_quote" }]),
}));

vi.mock("../../src/tools/register.js", () => ({
  getWalletToolDefinitions: vi
    .fn()
    .mockReturnValue([{ name: "wallet_generate" }, { name: "wallet_get_active" }]),
  getTransactionToolDefinitions: vi
    .fn()
    .mockReturnValue([{ name: "transaction_confirm" }, { name: "transaction_list" }]),
  getUtilityToolDefinitions: vi.fn().mockReturnValue([{ name: "server_status" }]),
}));

vi.mock("../../src/runtime/server.js", () => ({
  ProxyServer: class {
    async start(): Promise<void> {
      await mockState.proxyStart();
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

  it("completes startup without crashing when upstream adapters fail", async () => {
    await expect(startServer()).resolves.toBeUndefined();
    expect(mockState.blockscoutInitialize).toHaveBeenCalledTimes(1);
    expect(mockState.evmInitialize).toHaveBeenCalledTimes(1);
    expect(mockState.proxyStart).toHaveBeenCalledTimes(1);
  });

  it("logs summary showing framework tools while blockscout/evm are empty", async () => {
    await startServer();

    const lines = stderrSpy.mock.calls.map((call) => String(call[0]));
    const toolCountLine = lines.find((line) => line.includes("Tool counts =>"));

    expect(toolCountLine).toContain("framework:5");
    expect(toolCountLine).toContain("blockscout:0");
    expect(toolCountLine).toContain("evm:0");
  });
});
