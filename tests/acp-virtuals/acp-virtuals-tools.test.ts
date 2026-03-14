import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAcpToolDefinitions } from "../../src/tools/acp-virtuals/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

function textOf(result: CallToolResult, index = 0): string {
  const entry = result.content[index];
  return "text" in entry ? (entry.text as string) : "";
}

const { mockReadContract } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const real = await importOriginal<typeof import("viem")>();
  return {
    ...real,
    createPublicClient: vi.fn().mockReturnValue({
      readContract: mockReadContract,
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    }),
  };
});

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: vi.fn().mockReturnValue(undefined),
  createWalletClientForChain: vi.fn().mockReturnValue({
    writeContract: vi.fn().mockResolvedValue("0xmocktxhash"),
  }),
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

const mockConfig = {
  chainId: 8453,
  confirmWrites: true,
  confirmTtlMinutes: 30,
  walletAccountIndex: 0,
  walletAddressIndex: 0,
  chainRpcUrls: {} as Record<number, string>,
};

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockImplementation(() => mockConfig),
}));

const mockJobTuple = [
  1n, // id
  "0xclient1111111111111111111111111111111111", // client
  "0xprovider222222222222222222222222222222222", // provider
  BigInt(Math.floor(Date.now() / 1000) + 86400), // expiredAt
  1000000n, // budget
  2, // phase = TRANSACTION
  3n, // jobMemoCount
  1n, // evaluatorCount
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // paymentToken
  "0xevaluator33333333333333333333333333333333", // evaluator
];

const mockMemoList = [
  [
    {
      id: 1n,
      jobId: 1n,
      sender: "0xprovider222222222222222222222222222222222",
      content: "Deliverable content",
      memoType: 0,
      createdAt: BigInt(Math.floor(Date.now() / 1000)),
      isApproved: false,
      approvedBy: "0x0000000000000000000000000000000000000000",
      approvedAt: 0n,
      requiresApproval: true,
      metadata: "",
      isSecured: false,
      nextPhase: 3,
      expiredAt: BigInt(Math.floor(Date.now() / 1000) + 86400),
      state: 1,
    },
  ],
  1n, // totalCount
];

function setupReadContractMock(): void {
  mockReadContract.mockImplementation((args: { functionName: string }) => {
    if (args.functionName === "jobs") return Promise.resolve(mockJobTuple);
    if (args.functionName === "getAllMemos") return Promise.resolve(mockMemoList);
    if (args.functionName === "allowance") return Promise.resolve(0n);
    return Promise.resolve(undefined);
  });
}

describe("acp_get_job (read)", () => {
  beforeEach(() => {
    setupReadContractMock();
  });

  it("returns job details with memo history", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_get_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(textOf(result));
    expect(data.jobId).toBe(1);
    expect(data.client).toBe("0xclient1111111111111111111111111111111111");
    expect(data.provider).toBe("0xprovider222222222222222222222222222222222");
    expect(data.phase).toBe("TRANSACTION");
    expect(data.budget).toBe("1000000");
    expect(data.memos).toHaveLength(1);
    expect(data.memos[0].content).toBe("Deliverable content");
    expect(data.memos[0].memoType).toBe("MESSAGE");
    expect(data.memos[0].nextPhase).toBe("EVALUATION");
    expect(data.pendingMemos).toHaveLength(1);
  });

  it("returns UNSUPPORTED_CHAIN for non-Base chains", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_get_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1, chainId: 1 });
    expect(result.isError).toBe(true);
    const err = JSON.parse(textOf(result));
    expect(err.error).toBe("UNSUPPORTED_CHAIN");
  });
});

describe("acp_create_job (write)", () => {
  it("queues confirmation", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_create_job") as ToolDefinition;
    const result = await tool.handler({
      provider: "0x1234567890123456789012345678901234567890",
      evaluator: "0x1234567890123456789012345678901234567890",
      description: "Test job",
      expiryDuration: 86400,
    });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.id).toBeTruthy();
    expect(parsed.summary).toContain("confirm with ID");
  });

  it("rejects in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_create_job") as ToolDefinition;
    const result = await tool.handler({
      provider: "0x1234567890123456789012345678901234567890",
      evaluator: "0x1234567890123456789012345678901234567890",
      description: "Test job",
      expiryDuration: 86400,
    });
    expect(result.isError).toBe(true);
    const err = JSON.parse(textOf(result));
    expect(err.error).toBe("WALLET_READ_ONLY");
  });
});

describe("acp_complete_job (write)", () => {
  it("queues confirmation", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_complete_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1 });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.id).toBeTruthy();
    expect(parsed.summary).toContain("confirm with ID");
  });

  it("rejects in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_complete_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1 });
    expect(result.isError).toBe(true);
    const err = JSON.parse(textOf(result));
    expect(err.error).toBe("WALLET_READ_ONLY");
  });
});

describe("acp_fund_job (write)", () => {
  it("queues confirmation", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_fund_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1, amount: "1000000" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.id).toBeTruthy();
    expect(parsed.summary).toContain("confirm with ID");
  });

  it("rejects in read-only mode", async () => {
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_fund_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1, amount: "1000000" });
    expect(result.isError).toBe(true);
    const err = JSON.parse(textOf(result));
    expect(err.error).toBe("WALLET_READ_ONLY");
  });
});

describe("acp_submit_job (write)", () => {
  it("queues confirmation with deliverable info", async () => {
    const tools = getAcpToolDefinitions();
    const tool = tools.find((t) => t.name === "acp_submit_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1, deliverable: "My deliverable" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.summary).toContain("Submit deliverable");
  });
});

describe("chain support", () => {
  it("all tools reject unsupported chains", async () => {
    const tools = getAcpToolDefinitions();
    for (const tool of tools) {
      const minParams: Record<string, unknown> = { jobId: 1, chainId: 1 };
      if (tool.name === "acp_create_job") {
        minParams.provider = "0x1234567890123456789012345678901234567890";
        minParams.evaluator = "0x1234567890123456789012345678901234567890";
        minParams.description = "test";
        minParams.expiryDuration = 86400;
      }
      if (tool.name === "acp_submit_job") {
        minParams.deliverable = "test";
      }
      if (tool.name === "acp_set_budget") {
        minParams.amount = "1000000";
      }
      if (tool.name === "acp_fund_job") {
        minParams.amount = "1000000";
      }
      const result = await tool.handler(minParams);
      expect(result.isError).toBe(true);
      const err = JSON.parse(textOf(result));
      expect(err.error).toBe("UNSUPPORTED_CHAIN");
    }
  });
});

describe("all write tools reject in read-only mode", () => {
  const writeToolNames = [
    "acp_create_job",
    "acp_set_budget",
    "acp_fund_job",
    "acp_submit_job",
    "acp_complete_job",
    "acp_reject_job",
    "acp_claim_refund",
  ];

  const writeToolParams: Record<string, Record<string, unknown>> = {
    acp_create_job: {
      provider: "0x1234567890123456789012345678901234567890",
      evaluator: "0x1234567890123456789012345678901234567890",
      description: "test",
      expiryDuration: 86400,
    },
    acp_set_budget: { jobId: 1, amount: "1000000" },
    acp_fund_job: { jobId: 1, amount: "1000000" },
    acp_submit_job: { jobId: 1, deliverable: "test" },
    acp_complete_job: { jobId: 1 },
    acp_reject_job: { jobId: 1 },
    acp_claim_refund: { jobId: 1 },
  };

  for (const toolName of writeToolNames) {
    it(`${toolName} returns WALLET_READ_ONLY`, async () => {
      const { getWalletState } = await import("../../src/wallet/persistence.js");
      vi.mocked(getWalletState).mockReturnValueOnce({
        mode: "read-only",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      });
      const tools = getAcpToolDefinitions();
      const tool = tools.find((t) => t.name === toolName) as ToolDefinition;
      const result = await tool.handler(writeToolParams[toolName]);
      expect(result.isError).toBe(true);
      const err = JSON.parse(textOf(result));
      expect(err.error).toBe("WALLET_READ_ONLY");
    });
  }
});
