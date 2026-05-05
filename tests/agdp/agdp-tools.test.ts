import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAgdpToolDefinitions } from "../../src/tools/agdp/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

function parseText(result: CallToolResult): Record<string, unknown> {
  const item = result.content[0];
  if (!("text" in item)) throw new Error("Expected text content");
  return JSON.parse(item.text) as Record<string, unknown>;
}

vi.mock("../../src/agdp/api.js", () => ({
  searchOfferings: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Test Agent",
      description: "A test agent",
      walletAddress: "0x1234567890123456789012345678901234567890",
      contractAddress: "0xabcdef",
      metrics: { successRate: 0.95, isOnline: true },
      jobs: [
        {
          id: 10,
          name: "Test Service",
          description: "Service desc",
          price: 5,
          type: "service",
          requiredFunds: false,
          slaMinutes: 60,
        },
      ],
    },
  ]),
  getOfferingById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Agent",
    description: "A test agent",
    walletAddress: "0x1234567890123456789012345678901234567890",
    contractAddress: "0xabcdef",
    metrics: { successRate: 0.95, isOnline: true },
    jobs: [
      {
        id: 10,
        name: "Test Service",
        description: "Service desc",
        price: 5,
        type: "service",
        requiredFunds: false,
        slaMinutes: 60,
      },
    ],
  }),
  getJobs: vi.fn().mockResolvedValue([
    {
      id: 100,
      phase: "active",
      providerName: "Test Agent",
      providerWalletAddress: "0x1234",
      clientWalletAddress: "0x5678",
      deliverable: "",
      memos: [],
    },
  ]),
  createJobViaApi: vi.fn().mockResolvedValue({
    id: 200,
    phase: "created",
    providerName: "Test Agent",
  }),
  createOfferingViaApi: vi.fn().mockRejectedValue(new Error("NOT_SUPPORTED: Use aGDP CLI")),
  getAgdpBaseUrl: vi.fn().mockReturnValue("https://acpx.virtuals.io/api"),
}));

vi.mock("../../src/acp/contract.js", () => ({
  getAcpAddress: vi.fn().mockReturnValue(null),
  erc8183Abi: [],
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x1234567890123456789012345678901234567890",
    chainId: 8453,
    accountIndex: 0,
    addressIndex: 0,
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

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/config/env.js")>();
  return {
    ...real,
    getConfig: vi.fn().mockReturnValue({
      chainId: 8453,
      acpContractAddress: undefined,
      agdpApiUrl: "https://acpx.virtuals.io/api",
      confirmWrites: true,
      confirmTtlMinutes: 30,
      walletAccountIndex: 0,
      walletAddressIndex: 0,
      chainRpcUrls: {},
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agdp_get_offerings", () => {
  it("returns formatted offerings list", async () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_offerings") as ToolDefinition;
    const result = await tool.handler({ query: "defi" });
    expect(result.isError).toBe(false);
    const data = parseText(result);
    expect(data.count).toBe(1);
    expect((data.agents as Array<{ name: string }>)[0].name).toBe("Test Agent");
  });

  it("has readOnlyHint annotation", () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_offerings") as ToolDefinition;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("agdp_get_offering", () => {
  it("returns a single agent by ID", async () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_offering") as ToolDefinition;
    const result = await tool.handler({ offeringId: 1 });
    expect(result.isError).toBe(false);
    const data = parseText(result);
    expect(data.name).toBe("Test Agent");
    expect(data.walletAddress).toBe("0x1234567890123456789012345678901234567890");
  });

  it("returns error for non-existent offering", async () => {
    const { getOfferingById } = await import("../../src/agdp/api.js");
    vi.mocked(getOfferingById).mockResolvedValueOnce(null);
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_offering") as ToolDefinition;
    const result = await tool.handler({ offeringId: 999 });
    expect(result.isError).toBe(true);
    const err = parseText(result);
    expect(err.error).toBe("NOT_FOUND");
  });

  it("has readOnlyHint annotation", () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_offering") as ToolDefinition;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("agdp_get_my_jobs", () => {
  it("returns jobs for active wallet", async () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_my_jobs") as ToolDefinition;
    const result = await tool.handler({ status: "active" });
    expect(result.isError).toBe(false);
    const data = parseText(result);
    expect(data.count).toBe(1);
    expect((data.jobs as Array<{ providerName: string }>)[0].providerName).toBe("Test Agent");
  });

  it("returns error when no wallet address", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_get_my_jobs") as ToolDefinition;
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    const err = parseText(result);
    expect(err.error).toBe("WALLET_REQUIRED");
  });
});

describe("agdp_hire_agent — confirmation gating", () => {
  it("queues confirmation for hire agent", async () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_hire_agent") as ToolDefinition;
    const result = await tool.handler({ offeringId: 1 });
    expect(result.isError).toBe(false);
    const parsed = parseText(result);
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
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_hire_agent") as ToolDefinition;
    const result = await tool.handler({ offeringId: 1 });
    expect(result.isError).toBe(true);
    const err = parseText(result);
    expect(err.error).toBe("WALLET_READ_ONLY");
  });

  it("has destructiveHint annotation", () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_hire_agent") as ToolDefinition;
    expect(tool.annotations?.destructiveHint).toBe(true);
  });
});

describe("agdp_create_offering — fails fast without API key", () => {
  it("returns NOT_SUPPORTED immediately without going through confirmation", async () => {
    const tools = getAgdpToolDefinitions();
    const tool = tools.find((t) => t.name === "agdp_create_offering") as ToolDefinition;
    const result = await tool.handler({
      name: "My Offering",
      description: "A test offering",
      price: 10,
    });
    expect(result.isError).toBe(true);
    const parsed = parseText(result);
    expect(parsed.error).toBe("NOT_SUPPORTED");
    expect(parsed.message).toContain("LITE_AGENT_API_KEY");
  });
});

describe("tool definitions structure", () => {
  it("exports exactly 5 tools", () => {
    const tools = getAgdpToolDefinitions();
    expect(tools).toHaveLength(5);
  });

  it("all tools have required fields", () => {
    const tools = getAgdpToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.category).toBe("agenticEconomy");
      expect(typeof tool.handler).toBe("function");
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("tool names follow naming convention", () => {
    const tools = getAgdpToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toMatch(/^agdp_/);
    }
  });
});
