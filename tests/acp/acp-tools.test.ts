import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getErc8183ToolDefinitions } from "../../src/tools/acp/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

function textOf(result: CallToolResult, index = 0): string {
  const entry = result.content[index];
  return "text" in entry ? (entry.text as string) : "";
}

vi.mock("viem", async (importOriginal) => {
  const real = await importOriginal<typeof import("viem")>();
  return {
    ...real,
    createPublicClient: vi.fn().mockReturnValue({
      readContract: vi.fn().mockResolvedValue([
        "0x1111111111111111111111111111111111111111", // client (ABI position 0)
        "0x2222222222222222222222222222222222222222", // provider (ABI position 1)
        "0x3333333333333333333333333333333333333333", // evaluator (ABI position 2)
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // paymentToken (ABI position 3)
        BigInt(1000000), // budget (ABI position 4)
        BigInt(9999999999), // expiredAt (ABI position 5)
        "Test job", // description (ABI position 6)
        0, // status (ABI position 7, Open=0)
        `0x${"0".repeat(64)}`, // deliverable (ABI position 8)
      ]),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    }),
  };
});

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
  acpContractAddress: undefined as string | undefined,
  acpPaymentToken: undefined as string | undefined,
  agdpApiUrl: "https://acpx.virtuals.io/api",
  confirmWrites: true,
  confirmTtlMinutes: 30,
  walletAccountIndex: 0,
  walletAddressIndex: 0,
  chainRpcUrls: {} as Record<number, string>,
};

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockImplementation(() => mockConfig),
  tryGetConfig: vi.fn().mockImplementation(() => mockConfig),
}));

const originalConfig = { ...mockConfig };
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mockConfig, originalConfig);
});

describe("erc8183_get_job", () => {
  it("returns NOT_CONFIGURED when ACP_CONTRACT_ADDRESS not set", async () => {
    mockConfig.acpContractAddress = undefined;
    const tools = getErc8183ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8183_get_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1 });
    expect(result.isError).toBe(true);
    const err = JSON.parse(textOf(result));
    expect(err.error).toBe("NOT_CONFIGURED");
  });

  it("returns job data when ACP contract is configured", async () => {
    mockConfig.acpContractAddress = "0xACPContract1234567890123456789012345678";
    const tools = getErc8183ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8183_get_job") as ToolDefinition;
    const result = await tool.handler({ jobId: 1 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(textOf(result));
    expect(data.jobId).toBe(1);
    expect(data.client).toBe("0x1111111111111111111111111111111111111111");
    expect(data.description).toBe("Test job");
    expect(data.status).toBe("Open");
  });
});

describe("erc8183_create_job — confirmation gating", () => {
  beforeEach(() => {
    mockConfig.acpContractAddress = "0xACPContract1234567890123456789012345678";
  });

  it("queues confirmation for create job", async () => {
    const tools = getErc8183ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8183_create_job") as ToolDefinition;
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
    const tools = getErc8183ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8183_create_job") as ToolDefinition;
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

describe("erc8183_submit_job", () => {
  beforeEach(() => {
    mockConfig.acpContractAddress = "0xACPContract1234567890123456789012345678";
  });

  it("queues confirmation with deliverable info", async () => {
    const tools = getErc8183ToolDefinitions();
    const tool = tools.find((t) => t.name === "erc8183_submit_job") as ToolDefinition;
    const result = await tool.handler({
      jobId: 1,
      deliverable: "My deliverable",
    });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.summary).toContain("Submit ERC-8183 job");
  });
});

describe("all write tools reject in read-only mode", () => {
  beforeEach(() => {
    mockConfig.acpContractAddress = "0xACPContract1234567890123456789012345678";
  });

  const writeToolNames = [
    "erc8183_create_job",
    "erc8183_set_budget",
    "erc8183_fund_job",
    "erc8183_submit_job",
    "erc8183_complete_job",
    "erc8183_reject_job",
    "erc8183_claim_refund",
  ];

  const writeToolParams: Record<string, Record<string, unknown>> = {
    erc8183_create_job: {
      provider: "0x1234567890123456789012345678901234567890",
      evaluator: "0x1234567890123456789012345678901234567890",
      description: "test",
      expiryDuration: 86400,
    },
    erc8183_set_budget: { jobId: 1, amount: "1000000" },
    erc8183_fund_job: { jobId: 1, expectedBudget: "1000000" },
    erc8183_submit_job: { jobId: 1, deliverable: "test" },
    erc8183_complete_job: { jobId: 1 },
    erc8183_reject_job: { jobId: 1 },
    erc8183_claim_refund: { jobId: 1 },
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
      const tools = getErc8183ToolDefinitions();
      const tool = tools.find((t) => t.name === toolName) as ToolDefinition;
      const result = await tool.handler(writeToolParams[toolName]);
      expect(result.isError).toBe(true);
      const err = JSON.parse(textOf(result));
      expect(err.error).toBe("WALLET_READ_ONLY");
    });
  }
});
