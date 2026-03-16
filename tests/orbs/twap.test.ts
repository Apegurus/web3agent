import { getAccountOrders } from "@orbs-network/twap-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfigs = vi.hoisted(() => ({}) as Record<string, Record<string, unknown>>);

vi.mock("@orbs-network/twap-sdk", () => ({
  Configs: mockConfigs,
  getAccountOrders: vi.fn(),
  getConfig: vi.fn(),
}));

describe("orbs/twap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    for (const key of Object.keys(mockConfigs)) {
      delete mockConfigs[key];
    }
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
