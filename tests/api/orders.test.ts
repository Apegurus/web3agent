import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
  getWalletState: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mocks.getRuntime,
  invokeAndRequireData: mocks.invokeAndRequireData,
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: mocks.getWalletState,
}));

import { cancelOrder, listOrders, placeOrder } from "../../src/api/orders.js";

describe("api/orders", () => {
  const runtime = { invokeTool: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue(runtime);
    mocks.getWalletState.mockReturnValue({ address: "0x1234567890123456789012345678901234567890" });
  });

  it("listOrders without swapper uses wallet address", async () => {
    const response = { status: "ok", orders: [] };
    mocks.invokeAndRequireData.mockResolvedValue(response);

    const result = await listOrders({ chainId: 8453 });

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_query_orders", {
      chainId: 8453,
      swapper: "0x1234567890123456789012345678901234567890",
    });
    expect(result).toBe(response);
  });

  it("listOrders with explicit swapper preserves provided swapper", async () => {
    const response = { status: "ok", orders: [{ id: "1" }] };
    mocks.invokeAndRequireData.mockResolvedValue(response);

    const result = await listOrders({
      chainId: 8453,
      swapper: "0x9999999999999999999999999999999999999999",
    });

    expect(mocks.getWalletState).not.toHaveBeenCalled();
    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_query_orders", {
      chainId: 8453,
      swapper: "0x9999999999999999999999999999999999999999",
    });
    expect(result).toBe(response);
  });

  it("placeOrder invokes orbs_place_order", async () => {
    const params = {
      chainId: 8453,
      swapper: "0x1234567890123456789012345678901234567890",
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
      toAmount: "95",
      slippageBps: 50,
      ttlSeconds: 3600,
    };
    const response = { status: "submitted", response: { id: "order-1" } };
    mocks.invokeAndRequireData.mockResolvedValue(response);

    const result = await placeOrder(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_place_order", params);
    expect(result).toBe(response);
  });

  it("cancelOrder invokes orbs_cancel_order", async () => {
    const params = {
      chainId: 8453,
      orderHash: "0xabc",
    };
    const response = { status: "cancelled", txHash: "0xdef" };
    mocks.invokeAndRequireData.mockResolvedValue(response);

    const result = await cancelOrder(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_cancel_order", params);
    expect(result).toBe(response);
  });
});
