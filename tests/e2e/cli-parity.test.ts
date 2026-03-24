import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToolResultPayload } from "../../src/utils/tool-results.js";

const runtimeState = vi.hoisted(() => ({
  runtimeFactory: vi.fn(),
}));

const policyState = vi.hoisted(() => ({
  evaluatePolicy: vi.fn().mockReturnValue({ action: "allow", reasonCode: "ALLOWED" }),
  extractEstimatedUsd: vi.fn().mockResolvedValue(null),
  getCachedBalanceUsd: vi.fn().mockReturnValue(125),
  refreshBalanceUsd: vi.fn().mockResolvedValue(125),
  reserveSpend: vi.fn().mockReturnValue(0),
  commitReservation: vi.fn(),
  releaseReservation: vi.fn(),
  recordSpend: vi.fn(),
}));

vi.mock("@lifi/sdk", () => ({
  createConfig: vi.fn(),
  EVM: vi.fn().mockReturnValue({}),
  convertQuoteToRoute: vi.fn((quote) => ({ steps: [quote] })),
  getChains: vi.fn().mockResolvedValue([]),
  getQuote: vi.fn().mockResolvedValue({
    id: "quote-1",
    type: "lifi",
    tool: "connext",
    toolDetails: { key: "connext", name: "Connext", logoURI: "" },
    action: {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: { symbol: "ETH" },
      toToken: { symbol: "ETH" },
      fromAmount: "1e18",
    },
    estimate: {
      tool: "connext",
      fromAmount: "1e18",
      fromAmountUSD: "3000",
      toAmount: "1e18",
      toAmountUSD: "2990",
      toAmountMin: "0.99e18",
      approvalAddress: "0x0",
      executionDuration: 300,
      gasCosts: [
        {
          type: "SUM",
          price: "0",
          estimate: "0",
          limit: "0",
          amount: "0",
          amountUSD: "5",
          token: {},
        },
      ],
    },
    includedSteps: [],
  }),
  executeRoute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x1234567890123456789012345678901234567890",
    chainId: 1,
  }),
  getActiveAccount: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/wallet/confirmation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/wallet/confirmation.js")>();
  return {
    ...real,
    confirmationQueue: new real.ConfirmationQueueManager(true),
  };
});

vi.mock("../../src/utils/atomic-write.js", () => ({
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/wallet/audit.js", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 1 }),
  tryGetConfig: vi.fn().mockReturnValue({ lifiApiKey: undefined }),
}));

vi.mock("../../src/policy/config.js", () => ({
  resolvePolicy: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/policy/engine.js", () => ({
  evaluatePolicy: (...args: unknown[]) => policyState.evaluatePolicy(...args),
}));

vi.mock("../../src/policy/extract-usd.js", () => ({
  extractEstimatedUsd: (...args: unknown[]) => policyState.extractEstimatedUsd(...args),
}));

vi.mock("../../src/policy/spend-tracker.js", () => ({
  reserveSpend: (...args: unknown[]) => policyState.reserveSpend(...args),
  commitReservation: (...args: unknown[]) => policyState.commitReservation(...args),
  releaseReservation: (...args: unknown[]) => policyState.releaseReservation(...args),
  recordSpend: (...args: unknown[]) => policyState.recordSpend(...args),
}));

vi.mock("../../src/policy/balance-cache.js", () => ({
  getCachedBalanceUsd: (...args: unknown[]) => policyState.getCachedBalanceUsd(...args),
  refreshBalanceUsd: (...args: unknown[]) => policyState.refreshBalanceUsd(...args),
}));

vi.mock("../../src/cli/runtime.js", () => ({
  withCliRuntime: async (run: (runtime: unknown) => Promise<unknown>) =>
    run(await runtimeState.runtimeFactory()),
  createCliRuntime: vi.fn(),
}));

function bridgeInput() {
  return {
    fromChainId: 1,
    toChainId: 8453,
    fromToken: "0x0000000000000000000000000000000000000000",
    toToken: "0x0000000000000000000000000000000000000000",
    fromAmount: "1000000000000000000",
  };
}

async function createParityRuntime() {
  const { getLifiToolDefinitions } = await import("../../src/tools/lifi/index.js");
  const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
  const bridgeTool = getLifiToolDefinitions().find((tool) => tool.name === "lifi_execute_bridge");
  if (!bridgeTool) {
    throw new Error("Missing lifi_execute_bridge tool");
  }

  return {
    invokeTool: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "lifi_execute_bridge") {
        return bridgeTool.handler(args);
      }
      if (name === "transaction_confirm") {
        return transactionConfirm(args);
      }
      throw new Error(`Unknown tool: ${name}`);
    },
    transactions: {
      confirm: async (id: string) => {
        const result = await transactionConfirm({ id });
        const payload = getToolResultPayload(result);
        if (!payload.ok) {
          throw new Error(payload.error.message);
        }
        return payload.data;
      },
    },
  };
}

async function invokeCliTool(toolName: string, input: Record<string, unknown>) {
  let stdout = "";
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });

  try {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["call", toolName, "--input", JSON.stringify(input), "--json"]);
  } finally {
    stdoutWrite.mockRestore();
  }

  return JSON.parse(stdout);
}

describe("cli parity flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeState.runtimeFactory.mockImplementation(() => {
      throw new Error("runtimeFactory not initialized");
    });
    policyState.evaluatePolicy.mockReturnValue({ action: "allow", reasonCode: "ALLOWED" });
    policyState.extractEstimatedUsd.mockResolvedValue(null);
    policyState.getCachedBalanceUsd.mockReturnValue(125);
    policyState.refreshBalanceUsd.mockResolvedValue(125);
  });

  it("returns pending_confirmation for `tool call lifi_execute_bridge --input ... --json`", async () => {
    runtimeState.runtimeFactory.mockImplementation(() => createParityRuntime());

    const parsed = await invokeCliTool("lifi_execute_bridge", bridgeInput());

    expect(parsed.data.status).toBe("pending_confirmation");
    expect(parsed.data.id).toEqual(expect.any(String));
  });

  it("completes the queued flow through `tool call transaction_confirm --input ... --json`", async () => {
    runtimeState.runtimeFactory.mockImplementation(() => createParityRuntime());

    const queued = await invokeCliTool("lifi_execute_bridge", bridgeInput());
    const parsed = await invokeCliTool("transaction_confirm", { id: queued.data.id });

    expect(parsed.data.status ?? parsed.data.confirmed).toBeDefined();
  });

  it("matches runtime semantics for the same queued write flow", async () => {
    runtimeState.runtimeFactory.mockImplementation(() => createParityRuntime());

    const runtime = await createParityRuntime();
    const runtimeQueued = getToolResultPayload(
      await runtime.invokeTool("lifi_execute_bridge", bridgeInput())
    );
    if (!runtimeQueued.ok) {
      throw new Error("Expected queued runtime bridge invocation to succeed");
    }

    const cliQueued = await invokeCliTool("lifi_execute_bridge", bridgeInput());
    const cliConfirmed = await invokeCliTool("transaction_confirm", { id: cliQueued.data.id });
    const runtimeConfirmed = await runtime.transactions.confirm(String(runtimeQueued.data.id));

    expect(cliQueued.data.status).toBe(runtimeQueued.data.status);
    expect(cliConfirmed.data).toEqual(runtimeConfirmed);
  });
});
