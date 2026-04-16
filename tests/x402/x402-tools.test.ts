import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../../src/tools/register.js";
import { getX402ToolDefinitions } from "../../src/tools/x402/index.js";

vi.mock("@x402/fetch", () => ({
  x402Client: vi.fn().mockImplementation(() => ({
    register: vi.fn().mockReturnThis(),
  })),
  wrapFetchWithPayment: vi
    .fn()
    .mockReturnValue(
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: "test" }), { status: 200 }))
    ),
}));

vi.mock("@x402/evm", () => ({
  ExactEvmScheme: vi.fn().mockImplementation(() => ({})),
  toClientEvmSigner: vi.fn().mockReturnValue({}),
}));

vi.mock("@x402/core/http", () => ({
  decodePaymentRequiredHeader: vi.fn(),
}));

vi.mock("../../src/x402/client.js", () => ({
  probePaymentRequirements: vi.fn().mockResolvedValue({
    requirements: null,
    probeResponse: new Response("response body", { status: 200 }),
  }),
  createX402Client: vi.fn().mockReturnValue({
    client: {},
    fetchWithPayment: vi.fn().mockResolvedValue(new Response("response body", { status: 200 })),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("response body", { status: 200 }));
});

function mockPaymentRequired() {
  return {
    x402Version: 2,
    resource: { url: "https://example.com/api", method: "GET" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "10000",
        payTo: "0xabc",
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", decimals: 6 },
      },
    ],
  };
}

describe("x402_check_requirements", () => {
  it("returns no payment required when URL is not 402", async () => {
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_check_requirements") as ToolDefinition;
    const result = await tool.handler({ url: "https://example.com/api" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.paymentRequired).toBe(false);
  });

  it("returns payment requirements when URL returns 402", async () => {
    const { probePaymentRequirements } = await import("../../src/x402/client.js");
    vi.mocked(probePaymentRequirements).mockResolvedValueOnce({
      requirements: mockPaymentRequired(),
      probeResponse: new Response("", { status: 402 }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for testing — PaymentRequired has many required fields
    } as any);
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_check_requirements") as ToolDefinition;
    const result = await tool.handler({ url: "https://example.com/api" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.paymentRequired).toBe(true);
    expect(parsed.requirements.accepts[0].amount).toBe("10000");
  });

  it("has readOnlyHint annotation", () => {
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_check_requirements") as ToolDefinition;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("x402_fetch — confirmation gating", () => {
  it("executes directly when no payment required (no confirmation needed)", async () => {
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_fetch") as ToolDefinition;
    const result = await tool.handler({ url: "https://example.com/api" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.status).toBe(200);
    expect(parsed.ok).toBe(true);
  });

  it("queues confirmation when payment is required", async () => {
    const { probePaymentRequirements } = await import("../../src/x402/client.js");
    vi.mocked(probePaymentRequirements).mockResolvedValueOnce({
      requirements: mockPaymentRequired(),
      probeResponse: new Response("", { status: 402 }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for testing
    } as any);
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_fetch") as ToolDefinition;
    const result = await tool.handler({ url: "https://example.com/api" });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.id).toBeTruthy();
  });

  it("rejects in read-only mode", async () => {
    const { probePaymentRequirements } = await import("../../src/x402/client.js");
    vi.mocked(probePaymentRequirements).mockResolvedValueOnce({
      requirements: mockPaymentRequired(),
      probeResponse: new Response("", { status: 402 }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for testing
    } as any);
    const { getWalletState } = await import("../../src/wallet/persistence.js");
    vi.mocked(getWalletState).mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_fetch") as ToolDefinition;
    const result = await tool.handler({ url: "https://example.com/api" });
    expect(result.isError).toBe(true);
    const err = JSON.parse(result.content[0].text as string);
    expect(err.error).toBe("WALLET_READ_ONLY");
  });

  it("has destructiveHint annotation", () => {
    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_fetch") as ToolDefinition;
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  it("uses paymentChainId from requirements (not wallet chainId) when executing", async () => {
    const { probePaymentRequirements, createX402Client } = await import("../../src/x402/client.js");
    vi.mocked(probePaymentRequirements).mockResolvedValueOnce({
      requirements: {
        x402Version: 2,
        resource: { url: "https://example.com/api", method: "GET" },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:137",
            asset: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            amount: "10000",
            payTo: "0xabc",
            maxTimeoutSeconds: 60,
            extra: { name: "USDC", decimals: 6 },
          },
        ],
      },
      probeResponse: new Response("", { status: 402 }),
      // biome-ignore lint/suspicious/noExplicitAny: mock object for testing
    } as any);

    const { confirmationQueue } = await import("../../src/wallet/confirmation.js");
    const originalEnabled = confirmationQueue.enabled;
    confirmationQueue.enabled = false;

    const tools = getX402ToolDefinitions();
    const tool = tools.find((t) => t.name === "x402_fetch") as ToolDefinition;
    await tool.handler({ url: "https://example.com/api" });

    confirmationQueue.enabled = originalEnabled;

    expect(vi.mocked(createX402Client)).toHaveBeenCalledWith(137);
  });
});
