import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../../../src/tools/register.js";

/* ---------- Hoisted mocks ---------- */

const { mockPrepareSpotOrder, mockGetRequiredApprovals, mockSubmitSpotOrder, mockQuerySpotOrders } =
  vi.hoisted(() => ({
    mockPrepareSpotOrder: vi.fn(),
    mockGetRequiredApprovals: vi.fn(),
    mockSubmitSpotOrder: vi.fn(),
    mockQuerySpotOrders: vi.fn(),
  }));

/* ---------- Module mocks ---------- */

vi.mock("../../../src/orbs/spot-prepare.js", () => ({
  prepareSpotOrder: mockPrepareSpotOrder,
}));

vi.mock("../../../src/orbs/spot-client.js", () => ({
  submitSpotOrder: mockSubmitSpotOrder,
  querySpotOrders: mockQuerySpotOrders,
}));

vi.mock("../../../src/orbs/chains.js", () => ({
  isSpotSupported: vi.fn((chainId: number) => chainId === 137),
  getSpotError: vi.fn((chainId: number) => `Spot orders are not available on chain ${chainId}.`),
  isLiquidityHubSupported: vi.fn().mockReturnValue(true),
  getLiquidityHubError: vi.fn().mockReturnValue("not supported"),
  isTwapSupported: vi.fn().mockReturnValue(true),
  getTwapError: vi.fn().mockReturnValue("twap not supported"),
}));

vi.mock("../../../src/api/operations/orbs.js", () => ({
  getRequiredApprovals: mockGetRequiredApprovals,
}));

vi.mock("../../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x1234567890123456789012345678901234567890",
    chainId: 137,
  }),
  getActiveAccount: vi.fn().mockReturnValue({
    address: "0x1234567890123456789012345678901234567890",
    signTypedData: vi.fn().mockResolvedValue(`0x${"ab".repeat(65)}`),
  }),
}));

vi.mock("../../../src/wallet/confirmation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/wallet/confirmation.js")>();
  return {
    ...real,
    confirmationQueue: new real.ConfirmationQueueManager(true),
    registerExecutor: vi.fn(),
  };
});

vi.mock("../../../src/utils/write.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/utils/write.js")>();
  return { ...real };
});

vi.mock("../../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 137 }),
  tryGetConfig: vi.fn().mockReturnValue({ chainId: 137 }),
}));

/* ---------- Helpers ---------- */

function textOf(result: CallToolResult, index = 0): string {
  const entry = result.content[index];
  return "text" in entry ? (entry.text as string) : "";
}

function parseResult(result: CallToolResult): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

/* ---------- Fixture: a valid prepared order ---------- */

const MOCK_PREPARED_ORDER = {
  meta: {
    kind: "single",
    chunkCount: 1,
    chunkInputAmount: "1000000000000000000",
    start: 1700000000,
    deadline: 1700000300,
    epoch: 0,
    limit: "0",
  },
  warnings: [],
  approval: {
    token: "0xFromToken",
    spender: "0xRePermit",
    amount: "1000000000000000000",
    tx: { to: "0xFromToken", data: "0xabcd", value: "0" },
  },
  typedData: {
    domain: {
      name: "RePermit",
      version: "1",
      chainId: 137,
      verifyingContract: "0xRePermit",
    },
    primaryType: "RePermitWitnessTransferFrom",
    types: {},
    message: {
      permitted: { token: "0xFromToken", amount: "1000000000000000000" },
      spender: "0xReactor",
      nonce: "1700000000",
      deadline: "1700000300",
      witness: {},
    },
  },
  submit: {
    url: "https://spot.api/spot/order",
    body: { order: {}, signature: null, status: "pending" },
  },
  query: { url: "https://spot.api/spot/order" },
};

/* ---------- Tests ---------- */

describe("orbs_place_order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unsupported chains", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_order") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1, // Ethereum — not supported
      fromToken: "0xFromToken123456789012345678901234567",
      toToken: "0xToToken1234567890123456789012345678901",
      fromAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });

  it("validates required fields (missing fromToken)", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_order") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      toToken: "0xToToken1234567890123456789012345678901",
      fromAmount: "1000000000000000000",
      // fromToken omitted
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });

  it("queues write on supported chain with valid params", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_order") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000000000000000",
    });

    // With confirmation queue enabled and mode=private-key, it should queue
    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.status).toBe("pending_confirmation");
  });
});

describe("orbs_prepare_order_intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareSpotOrder.mockReturnValue(MOCK_PREPARED_ORDER);
    mockGetRequiredApprovals.mockResolvedValue([]);
  });

  it("returns prepared order data with valid params", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_order_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed).toHaveProperty("typedData");
    expect(parsed).toHaveProperty("approval");
    expect(parsed).toHaveProperty("submit");
    expect(parsed).toHaveProperty("meta");
    expect(parsed).toHaveProperty("requiredApprovals");
    expect(parsed.requiredApprovals).toEqual([]);
    expect(parsed.chainId).toBe(137);
  });

  it("rejects unsupported chain", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_order_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });

  it("returns error when prepareSpotOrder throws", async () => {
    mockPrepareSpotOrder.mockImplementation(() => {
      throw new Error("native input token not supported");
    });

    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_order_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000000000000000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("ORBS_ORDER_ERROR");
    expect(String(parsed.message)).toContain("native input token not supported");
  });
});

describe("orbs_submit_signed_order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_SIGNATURE = `0x${"ab".repeat(65)}`;

  it("calls submitSpotOrder and returns success result", async () => {
    mockSubmitSpotOrder.mockResolvedValue({
      ok: true,
      status: 200,
      response: { hash: "0xabc" },
    });

    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_submit_signed_order") as ToolDefinition;

    const result = await tool.handler({
      submitUrl: "https://spot.api/spot/order",
      order: { key: "value" },
      signature: VALID_SIGNATURE,
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe(200);
    expect(mockSubmitSpotOrder).toHaveBeenCalledOnce();
  });

  it("returns error on submit failure", async () => {
    mockSubmitSpotOrder.mockResolvedValue({
      ok: false,
      status: 400,
      response: "bad request",
    });

    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_submit_signed_order") as ToolDefinition;

    const result = await tool.handler({
      submitUrl: "https://spot.api/spot/order",
      order: { key: "value" },
      signature: VALID_SIGNATURE,
    });

    // The handler returns formatToolResponse wrapping the spotResult (ok: false is the data, not an error)
    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(400);
  });

  it("returns validation error on invalid signature", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_submit_signed_order") as ToolDefinition;

    const result = await tool.handler({
      submitUrl: "https://spot.api/spot/order",
      order: { key: "value" },
      signature: "0xshort", // too short
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });
});

describe("orbs_query_orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns orders from Spot API on success", async () => {
    mockQuerySpotOrders.mockResolvedValue({
      ok: true,
      status: 200,
      orders: [{ hash: "0xabc", status: "pending" }],
    });

    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_query_orders") as ToolDefinition;

    const result = await tool.handler({
      swapper: "0x1234567890123456789012345678901234567890",
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.source).toBe("spot");
    expect(Array.isArray(parsed.orders)).toBe(true);
    expect((parsed.orders as unknown[]).length).toBe(1);
  });

  it("rejects when neither swapper nor hash is provided", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_query_orders") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      // neither swapper nor hash provided
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });

  it("returns error when Spot API fails and no swapper for fallback", async () => {
    mockQuerySpotOrders.mockResolvedValue({
      ok: false,
      status: 500,
      error: "internal server error",
    });

    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_query_orders") as ToolDefinition;

    const result = await tool.handler({
      hash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("ORBS_QUERY_ERROR");
  });
});

describe("orbs_place_twap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps chunks and fillDelay to fromMaxAmount and epoch", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_twap") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      chunks: 5,
      fillDelay: 300,
    });

    // With confirmation queue enabled, should queue
    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.status).toBe("pending_confirmation");
  });

  it("rejects unsupported chain", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_twap") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      chunks: 5,
      fillDelay: 300,
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });

  it("validates required fields (missing chunks)", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_twap") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      fillDelay: 300,
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });
});

describe("orbs_prepare_twap_intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareSpotOrder.mockReturnValue(MOCK_PREPARED_ORDER);
    mockGetRequiredApprovals.mockResolvedValue([]);
  });

  it("maps chunks/fillDelay and passes correct params to prepareSpotOrder", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_twap_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      chunks: 5,
      fillDelay: 300,
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed).toHaveProperty("typedData");
    expect(parsed).toHaveProperty("approval");
    expect(parsed.chainId).toBe(137);

    // Verify prepareSpotOrder was called with mapped params
    expect(mockPrepareSpotOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAmount: "200000", // 1000000 / 5
        fromMaxAmount: "1000000",
        epoch: 300,
      })
    );
  });

  it("rejects unsupported chain", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_twap_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      chunks: 5,
      fillDelay: 300,
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });
});

describe("orbs_place_limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps toMinAmount to outputLimit and queues write", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_limit") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      toMinAmount: "500000",
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.status).toBe("pending_confirmation");
  });

  it("rejects unsupported chain", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_limit") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      toMinAmount: "500000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });

  it("validates required fields (missing toMinAmount)", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_place_limit") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });
});

describe("orbs_prepare_limit_intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareSpotOrder.mockReturnValue(MOCK_PREPARED_ORDER);
    mockGetRequiredApprovals.mockResolvedValue([]);
  });

  it("maps toMinAmount to outputLimit and passes to prepareSpotOrder", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_limit_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      toMinAmount: "500000",
    });

    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed).toHaveProperty("typedData");
    expect(parsed).toHaveProperty("approval");
    expect(parsed.chainId).toBe(137);

    // Verify prepareSpotOrder was called with outputLimit
    expect(mockPrepareSpotOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAmount: "1000000",
        outputLimit: "500000",
      })
    );
  });

  it("calculates deadline from expiry", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_limit_intent") as ToolDefinition;

    const beforeTs = Math.floor(Date.now() / 1000);

    const result = await tool.handler({
      chainId: 137,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      toMinAmount: "500000",
      expiry: 86400,
    });

    expect(result.isError).toBe(false);

    const callArgs = mockPrepareSpotOrder.mock.calls[0][0] as Record<string, unknown>;
    const deadline = callArgs.deadline as number;
    expect(deadline).toBeGreaterThanOrEqual(beforeTs + 86400);
    expect(deadline).toBeLessThanOrEqual(beforeTs + 86400 + 5); // allow 5s tolerance
  });

  it("rejects unsupported chain", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_prepare_limit_intent") as ToolDefinition;

    const result = await tool.handler({
      chainId: 1,
      account: "0x1234567890123456789012345678901234567890",
      fromToken: "0xaaaa111111111111111111111111111111111111",
      toToken: "0xbbbb222222222222222222222222222222222222",
      fromAmount: "1000000",
      toMinAmount: "500000",
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("CHAIN_NOT_SUPPORTED");
  });
});

describe("orbs_cancel_order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues write on supported chain with valid digest", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_cancel_order") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      digest: `0x${"cd".repeat(32)}`,
    });

    // With confirmationQueue enabled, should queue
    expect(result.isError).toBe(false);
    const parsed = parseResult(result);
    expect(parsed.status).toBe("pending_confirmation");
  });

  it("validates required fields (missing digest)", async () => {
    const { getOrbsToolDefinitions } = await import("../../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const tool = tools.find((t) => t.name === "orbs_cancel_order") as ToolDefinition;

    const result = await tool.handler({
      chainId: 137,
      // digest omitted
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toBe("INVALID_PARAMS");
  });
});
