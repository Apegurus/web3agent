import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getErc8004ToolDefinitions } from "../../src/tools/erc8004/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

function textContent(result: CallToolResult): Record<string, unknown> {
  const first = result.content[0];
  if (first.type !== "text") throw new Error(`Expected text, got ${first.type}`);
  return JSON.parse(first.text) as Record<string, unknown>;
}

vi.mock("viem", async (importOriginal) => {
  const real = await importOriginal<typeof import("viem")>();
  return {
    ...real,
    createPublicClient: vi.fn().mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    }),
    createWalletClient: vi.fn().mockReturnValue({
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    }),
  };
});

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: vi.fn().mockReturnValue({}),
  createWalletClientForChain: vi.fn().mockReturnValue({
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
  }),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x1234567890123456789012345678901234567890",
    chainId: 8453,
  }),
  getActiveAccount: vi.fn().mockReturnValue({
    address: "0x1234567890123456789012345678901234567890",
  }),
}));

vi.mock("../../src/wallet/confirmation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/wallet/confirmation.js")>();
  return {
    ...real,
    confirmationQueue: new real.ConfirmationQueueManager(true),
    registerExecutor: vi.fn(),
  };
});

const mockConfig = vi.hoisted(() => ({
  chainId: 8453,
  pinataJwt: undefined as string | undefined,
  mcpEndpointUrl: undefined as string | undefined,
  agdpApiUrl: "https://acpx.virtuals.io/api",
  confirmWrites: true,
  confirmTtlMinutes: 30,
  walletAccountIndex: 0,
  walletAddressIndex: 0,
  chainRpcUrls: {},
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/config/env.js")>();
  return {
    ...real,
    getConfig: vi.fn().mockReturnValue(mockConfig),
  };
});

const originalConfig = { ...mockConfig };
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mockConfig, originalConfig);
});

describe("erc8004_register_agent", () => {
  it("returns MISSING_IPFS_CONFIG when no agentURI and no PINATA_JWT", async () => {
    mockConfig.pinataJwt = undefined;
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_register_agent") as ToolDefinition;
    const result = await tool.handler({ name: "Test Agent", description: "A test agent" });
    expect(result.isError).toBe(true);
    const err = textContent(result);
    expect(err.error).toBe("MISSING_IPFS_CONFIG");
    expect(err.message).toContain("agentURI");
    expect(err.message).toContain("PINATA_JWT");
  });

  it("queues confirmation when agentURI is provided", async () => {
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_register_agent") as ToolDefinition;
    const result = await tool.handler({
      name: "Test Agent",
      description: "A test agent",
      agentURI: "ipfs://QmTest123",
    });
    expect(result.isError).toBe(false);
    const parsed = textContent(result);
    expect(parsed.status).toBe("pending_confirmation");
  });

  it("rejects in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_register_agent") as ToolDefinition;
    const result = await tool.handler({
      name: "Test Agent",
      description: "A test agent",
      agentURI: "ipfs://QmTest123",
    });
    expect(result.isError).toBe(true);
    const err = textContent(result);
    expect(err.error).toBe("WALLET_READ_ONLY");
  });
});

describe("erc8004_get_agent", () => {
  it("returns agent info by agentId", async () => {
    const { createPublicClient } = await import("viem");
    vi.mocked(createPublicClient).mockReturnValueOnce({
      readContract: vi.fn().mockResolvedValue(["0x1234", "ipfs://QmTest"]),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for viem PublicClient testing
    } as any);
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_get_agent") as ToolDefinition;
    const result = await tool.handler({ agentId: 1 });
    expect(result.isError).toBe(false);
    const data = textContent(result);
    expect(data.agentId).toBeTruthy();
  });

  it("returns not registered when walletAddress has no agent", async () => {
    const { createPublicClient } = await import("viem");
    vi.mocked(createPublicClient).mockReturnValueOnce({
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for viem PublicClient testing
    } as any);
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_get_agent") as ToolDefinition;
    const result = await tool.handler({
      walletAddress: "0x1234567890123456789012345678901234567890",
    });
    expect(result.isError).toBe(false);
    const data = textContent(result);
    expect(data.registered).toBe(false);
  });

  it("has readOnlyHint annotation", () => {
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_get_agent") as ToolDefinition;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("erc8004_submit_feedback — confirmation gating", () => {
  it("queues confirmation for feedback submission", async () => {
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_submit_feedback") as ToolDefinition;
    const result = await tool.handler({ agentId: 1, value: 80 });
    expect(result.isError).toBe(false);
    const parsed = textContent(result);
    expect(parsed.status).toBe("pending_confirmation");
  });

  it("rejects in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getErc8004ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8004_submit_feedback") as ToolDefinition;
    const result = await tool.handler({ agentId: 1, value: 80 });
    expect(result.isError).toBe(true);
    const err = textContent(result);
    expect(err.error).toBe("WALLET_READ_ONLY");
  });
});
