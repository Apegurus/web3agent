import {
  buildRePermitOrderData,
  getAccountOrders,
  getConfig,
  getSrcTokenChunkAmount,
  submitOrder,
} from "@orbs-network/twap-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConfigs = vi.hoisted(() => ({}) as Record<string, Record<string, unknown>>);

vi.mock("@orbs-network/twap-sdk", () => ({
  Configs: mockConfigs,
  buildRePermitOrderData: vi.fn(),
  getAccountOrders: vi.fn(),
  getSrcTokenChunkAmount: vi.fn(),
  getConfig: vi.fn(),
  submitOrder: vi.fn(),
}));

describe("orbs/twap", () => {
  const baseParams = {
    chainId: 8453,
    srcToken: "0xSrc",
    dstToken: "0xDst",
    srcAmount: "1000",
    chunks: 5,
    fillDelaySeconds: 60,
    durationSeconds: 600,
    account: "0xAccount",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    for (const key of Object.keys(mockConfigs)) {
      delete mockConfigs[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prepareTwapOrder builds expected typed order payload", async () => {
    const config = { contract: "0xConfig" } as never;
    mockConfigs.QuickSwapBase = { chainId: 8453, partner: "quick" };
    vi.mocked(getConfig).mockReturnValue(config);
    vi.mocked(getSrcTokenChunkAmount).mockReturnValue("200");
    vi.mocked(buildRePermitOrderData).mockReturnValue({
      domain: { name: "Orbs" },
      order: { maker: "0xAccount" },
      types: { RePermitOrder: [] },
      primaryType: "RePermitWitnessTransferFrom",
    } as never);

    const { prepareTwapOrder } = await import("../../src/orbs/twap.js");
    const result = prepareTwapOrder(baseParams);

    expect(getConfig).toHaveBeenCalledWith(8453, "quick");
    expect(getSrcTokenChunkAmount).toHaveBeenCalledWith("1000", 5);
    expect(buildRePermitOrderData).toHaveBeenCalledWith({
      chainId: 8453,
      srcToken: "0xSrc",
      dstToken: "0xDst",
      srcAmount: "1000",
      deadlineMillis: Date.parse("2025-01-01T00:10:00.000Z"),
      fillDelayMillis: 60000,
      slippage: 0.5,
      account: "0xAccount",
      srcAmountPerTrade: "200",
      dstMinAmountPerTrade: undefined,
      triggerAmountPerTrade: undefined,
      config,
    });
    expect(result).toEqual({
      domain: { name: "Orbs" },
      order: { maker: "0xAccount" },
      types: { RePermitOrder: [] },
      primaryType: "RePermitWitnessTransferFrom",
    });
  });

  it("prepareTwapOrder throws when chain config is unavailable", async () => {
    const { prepareTwapOrder } = await import("../../src/orbs/twap.js");

    expect(() => prepareTwapOrder(baseParams)).toThrow("No TWAP config available for chain 8453");
    expect(buildRePermitOrderData).not.toHaveBeenCalled();
  });

  it("distinguishes TWAP and LIMIT params when building order", async () => {
    mockConfigs.QuickSwapBase = { chainId: 8453, partner: "quick" };
    vi.mocked(getConfig).mockReturnValue({ chainId: 8453 } as never);
    vi.mocked(getSrcTokenChunkAmount).mockReturnValue("1000");
    vi.mocked(buildRePermitOrderData).mockReturnValue({
      domain: {},
      order: { id: "order" },
      types: {},
      primaryType: "RePermitWitnessTransferFrom",
    } as never);

    const { prepareTwapOrder } = await import("../../src/orbs/twap.js");

    prepareTwapOrder(baseParams);
    prepareTwapOrder({
      ...baseParams,
      chunks: 1,
      fillDelaySeconds: 0,
      durationSeconds: 3600,
      dstMinAmountPerTrade: "1200",
    });

    const [twapCall, limitCall] = vi.mocked(buildRePermitOrderData).mock.calls;
    expect(twapCall?.[0]).toMatchObject({
      dstMinAmountPerTrade: undefined,
      triggerAmountPerTrade: undefined,
      fillDelayMillis: 60000,
    });
    expect(limitCall?.[0]).toMatchObject({
      dstMinAmountPerTrade: "1200",
      triggerAmountPerTrade: undefined,
      fillDelayMillis: 0,
    });
  });

  it("submitSignedOrder delegates to SDK submitOrder", async () => {
    const sdkOrder = { id: "1", status: "OPEN" } as never;
    const signature = {
      v: "0x1b",
      r: `0x${"aa".repeat(32)}`,
      s: `0x${"bb".repeat(32)}`,
    } as never;
    vi.mocked(submitOrder).mockResolvedValue(sdkOrder);

    const { submitSignedOrder } = await import("../../src/orbs/twap.js");

    const result = await submitSignedOrder({ maker: "0xAccount" } as never, signature);

    expect(submitOrder).toHaveBeenCalledWith({ maker: "0xAccount" }, signature);
    expect(result).toBe(sdkOrder);
  });

  it("listOrders forwards defaults and returns mocked response", async () => {
    const orders = [{ id: "1" }, { id: "2" }] as never;
    vi.mocked(getAccountOrders).mockResolvedValue(orders);

    const { listOrders } = await import("../../src/orbs/twap.js");

    const result = await listOrders(8453, "0xAccount");

    expect(getAccountOrders).toHaveBeenCalledWith({
      chainId: 8453,
      account: "0xAccount",
      limit: 50,
      page: 0,
    });
    expect(result).toBe(orders);
  });

  it("listOrders forwards explicit pagination options", async () => {
    vi.mocked(getAccountOrders).mockResolvedValue([] as never);

    const { listOrders } = await import("../../src/orbs/twap.js");

    await listOrders(1, "0xAccount", { limit: 10, page: 3 });

    expect(getAccountOrders).toHaveBeenCalledWith({
      chainId: 1,
      account: "0xAccount",
      limit: 10,
      page: 3,
    });
  });
});
