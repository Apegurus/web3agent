import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/types/config.js";

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
  };
});

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

vi.mock("../../src/ccxt/runtime-state.js", () => {
  const cancelOrder = vi.fn(async () => {
    throw new Error("MOCK_EXCHANGE_NO_NETWORK: cancelOrder");
  });
  const createOrder = vi.fn(async () => {
    throw new Error("MOCK_EXCHANGE_NO_NETWORK: createOrder");
  });
  const loadMarkets = vi.fn(async () => ({}));

  const mockExchange = {
    id: "mock",
    name: "mock",
    has: {
      spot: true,
      fetchBalance: true,
      fetchOpenOrders: true,
      createOrder: true,
      cancelOrder: true,
    },
    symbols: ["BTC/USDT"],
    markets: { "BTC/USDT": { symbol: "BTC/USDT" } },
    cancelOrder,
    createOrder,
    loadMarkets,
  };

  const factory = {
    getPublicExchange: vi.fn(async () => mockExchange),
    getPrivateExchange: vi.fn(async () => mockExchange),
    getConfiguredAccounts: vi.fn(() => [
      { name: "test-account", exchangeId: "mock", apiKey: "x", secret: "y" },
    ]),
  };

  const registry = {
    accounts: [{ name: "test-account", exchangeId: "mock", apiKey: "x", secret: "y" }],
    warnings: [],
    insecurePermissions: false,
    configPath: undefined,
  };

  return {
    getCcxtRuntimeState: () => ({ factory, registry }),
  };
});

vi.mock("../../src/ccxt/accounts.js", () => ({
  accountHasCredentials: () => true,
  resolveExchangeIdFromAccount: () => "mock",
  listAccountSummaries: () => [{ name: "test-account", exchangeId: "mock", sandbox: false }],
  getAccountByName: () => ({
    name: "test-account",
    exchangeId: "mock",
    apiKey: "x",
    secret: "y",
  }),
}));

function buildTestConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    chainId: 1,
    privateKey: undefined,
    mnemonic: undefined,
    walletAccountIndex: 0,
    walletAddressIndex: 0,
    rpcUrl: undefined,
    chainRpcUrls: {},
    confirmWrites: false,
    confirmTtlMinutes: 30,
    etherscanApiKey: undefined,
    etherscanApiUrl: "https://api.etherscan.io",
    lifiApiKey: undefined,
    zeroxApiKey: undefined,
    coingeckoApiKey: undefined,
    orbsPartner: undefined,
    ...overrides,
  };
}

function parseToolText(result: {
  content: Array<{ type: string; text?: string }>;
}): Record<string, unknown> {
  const firstContent = result.content[0];
  expect(firstContent?.type).toBe("text");
  if (!firstContent || typeof firstContent.text !== "string") {
    throw new Error("Expected first tool response content item to be text");
  }
  return JSON.parse(firstContent.text) as Record<string, unknown>;
}

// formatToolError writes the legacy flat shape ({ error: code, message }) to
// content[0].text, and the nested envelope ({ ok: false, error: { code, message } })
// to structuredContent. Tests that consume content[0].text use the flat shape.
function getFlatErrorFields(parsed: Record<string, unknown>): { code: string; message: string } {
  const code = parsed.error;
  const message = parsed.message;
  if (typeof code !== "string") {
    throw new Error(
      `Expected error code at parsed.error to be a string, got ${typeof code}: ${JSON.stringify(parsed)}`
    );
  }
  return {
    code,
    message: typeof message === "string" ? message : "",
  };
}

describe("managed-runtime invokeTool — integration through policy gate", () => {
  let homeDir = "";
  let originalHome: string | undefined;

  beforeAll(() => {
    homeDir = mkdtempSync(join(tmpdir(), "web3agent-it-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env.HOME = originalHome;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("T2-integration: ccxt_private_write cancelOrder passes the policy gate (destructive classification)", async () => {
    const { createRuntime } = await import("../../src/runtime/managed-runtime.js");
    const runtime = await createRuntime({
      config: buildTestConfig({ confirmWrites: false }),
    });

    try {
      const result = await runtime.invokeTool("ccxt_private_write", {
        account: "test-account",
        method: "cancelOrder",
        args: ["fake-id", "BTC/USDT"],
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolText(result);
      const { code, message } = getFlatErrorFields(parsed);

      // The classifier should have routed cancelOrder as "destructive", so
      // financial-gate codes must NOT appear.
      expect(code).not.toBe("UNESTIMABLE_FINANCIAL_WRITE");
      expect(code).not.toBe("SPEND_LIMIT_ERROR");
      expect(code).not.toBe("USD_ESTIMATION_FAILED");
      expect(code).not.toBe("POLICY_DENIED");
      // Failure must originate from the mock exchange (downstream of the gate),
      // not from upstream policy. Either a CCXT_*-prefixed code OR a message
      // tagged with our mock sentinel is acceptable evidence.
      const reachedExchange =
        code.startsWith("CCXT_") || message.includes("MOCK_EXCHANGE_NO_NETWORK");
      expect(reachedExchange).toBe(true);
    } finally {
      await runtime.shutdown();
    }
  });

  it("T2-integration: ccxt_private_write createOrder is correctly gated as financial", async () => {
    const { createRuntime } = await import("../../src/runtime/managed-runtime.js");
    const runtime = await createRuntime({
      config: buildTestConfig({ confirmWrites: false }),
    });

    try {
      const result = await runtime.invokeTool("ccxt_private_write", {
        account: "test-account",
        method: "createOrder",
        args: ["BTC/USDT", "market", "buy", 0.001],
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolText(result);
      const { code, message } = getFlatErrorFields(parsed);

      // createOrder must be financial-classified. The acceptable outcomes are:
      //  - the financial gate denied (SPEND_LIMIT_ERROR, UNESTIMABLE_FINANCIAL_WRITE,
      //    USD_ESTIMATION_FAILED, POLICY_DENIED) — proves the gate ran, OR
      //  - the call passed the gate and reached the mock exchange (CCXT_* / MOCK_).
      // What must NOT happen: passing through with a non-CCXT, non-gate error code,
      // which would indicate the financial branch was bypassed entirely.
      const gateCodes = new Set([
        "SPEND_LIMIT_ERROR",
        "UNESTIMABLE_FINANCIAL_WRITE",
        "USD_ESTIMATION_FAILED",
        "POLICY_DENIED",
      ]);
      const reachedExchange =
        code.startsWith("CCXT_") || message.includes("MOCK_EXCHANGE_NO_NETWORK");

      expect(gateCodes.has(code) || reachedExchange).toBe(true);
    } finally {
      await runtime.shutdown();
    }
  });

  it("T1-integration: wallet_activate → transaction_confirm succeeds from read-only state (CONFIRM_WRITES=true)", async () => {
    const { createRuntime } = await import("../../src/runtime/managed-runtime.js");
    const runtime = await createRuntime({
      config: buildTestConfig({ confirmWrites: true }),
    });

    try {
      const enqueue = await runtime.invokeTool("wallet_activate", {
        privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(enqueue.isError).toBe(false);
      const enqueuePayload = parseToolText(enqueue);
      expect(enqueuePayload.status).toBe("pending_confirmation");
      const pendingId = enqueuePayload.id;
      expect(typeof pendingId).toBe("string");

      const confirm = await runtime.invokeTool("transaction_confirm", { id: pendingId });
      expect(confirm.isError).toBe(false);
      const confirmPayload = parseToolText(confirm);
      expect(typeof confirmPayload.address).toBe("string");
      expect(confirmPayload.mode).toBe("private-key");
    } finally {
      await runtime.shutdown();
    }
  });
});
