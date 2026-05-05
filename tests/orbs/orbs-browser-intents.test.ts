import { describe, expect, it, vi } from "vitest";
import { getOrbsToolDefinitions } from "../../src/tools/orbs/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

const intentMocks = vi.hoisted(() => ({
  prepareSwapIntent: vi.fn(),
  getRequiredApprovals: vi.fn(),
  submitSignedSwap: vi.fn(),
}));

const spotClientMocks = vi.hoisted(() => ({
  submitSpotOrder: vi.fn(),
  querySpotOrders: vi.fn(),
}));

vi.mock("../../src/api/intents.js", () => ({
  prepareSwapIntent: (...args: unknown[]) => intentMocks.prepareSwapIntent(...args),
  getRequiredApprovals: (...args: unknown[]) => intentMocks.getRequiredApprovals(...args),
  submitSignedSwap: (...args: unknown[]) => intentMocks.submitSignedSwap(...args),
}));

vi.mock("../../src/orbs/spot-client.js", () => ({
  submitSpotOrder: (...args: unknown[]) => spotClientMocks.submitSpotOrder(...args),
  querySpotOrders: (...args: unknown[]) => spotClientMocks.querySpotOrders(...args),
}));

describe("Orbs browser-wallet MCP tools", () => {
  it("registers the new browser-wallet tools with expected categories", () => {
    const categories = Object.fromEntries(
      getOrbsToolDefinitions().map((tool) => [tool.name, tool.category])
    );

    expect(categories.orbs_prepare_swap_intent).toBe("swap");
    expect(categories.orbs_get_required_approvals).toBe("swap");
    expect(categories.orbs_submit_signed_swap).toBe("swap");
    expect(categories.orbs_prepare_order_intent).toBe("orders");
    expect(categories.orbs_submit_signed_order).toBe("orders");
    expect(categories.orbs_query_orders).toBe("orders");
  });

  it("delegates orbs_prepare_swap_intent to the shared API", async () => {
    intentMocks.prepareSwapIntent.mockResolvedValue({
      chainId: 8453,
      requiredApprovals: [],
      eip712: { domain: {}, types: {}, primaryType: "Permit", message: {} },
      quote: {
        sessionId: "session-1",
        inToken: "0x1",
        outToken: "0x2",
        fromAmount: "10",
        outAmount: "20",
        minAmountOut: "19",
        user: "0x1234567890123456789012345678901234567890",
      },
    });

    const tool = getOrbsToolDefinitions().find(
      (definition) => definition.name === "orbs_prepare_swap_intent"
    ) as ToolDefinition;
    const result = await tool.handler({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "10",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(intentMocks.prepareSwapIntent).toHaveBeenCalledWith({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "10",
      account: "0x1234567890123456789012345678901234567890",
    });
    expect(result.isError).toBe(false);
  });

  it("delegates orbs_submit_signed_order to the Spot API", async () => {
    spotClientMocks.submitSpotOrder.mockResolvedValue({
      ok: true,
      status: 200,
      response: { id: "order-1" },
    });

    const tool = getOrbsToolDefinitions().find(
      (definition) => definition.name === "orbs_submit_signed_order"
    ) as ToolDefinition;
    // Build a valid 65-byte signature (0x + 130 hex chars)
    const sig = `0x${"ab".repeat(65)}`;
    const result = await tool.handler({
      submitUrl: "https://agents-sink.orbs.network/orders/new",
      order: { maker: "0xabc" },
      signature: sig,
    });

    expect(spotClientMocks.submitSpotOrder).toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });
});
