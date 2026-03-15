import { describe, expect, it, vi } from "vitest";
import { getOrbsToolDefinitions } from "../../src/tools/orbs/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

const intentMocks = vi.hoisted(() => ({
  prepareSwapIntent: vi.fn(),
  getRequiredApprovals: vi.fn(),
  prepareTwapIntent: vi.fn(),
  prepareLimitIntent: vi.fn(),
  submitSignedSwap: vi.fn(),
  submitSignedTwapOrder: vi.fn(),
}));

vi.mock("../../src/api/intents.js", () => ({
  prepareSwapIntent: (...args: unknown[]) => intentMocks.prepareSwapIntent(...args),
  getRequiredApprovals: (...args: unknown[]) => intentMocks.getRequiredApprovals(...args),
  prepareTwapIntent: (...args: unknown[]) => intentMocks.prepareTwapIntent(...args),
  prepareLimitIntent: (...args: unknown[]) => intentMocks.prepareLimitIntent(...args),
  submitSignedSwap: (...args: unknown[]) => intentMocks.submitSignedSwap(...args),
  submitSignedTwapOrder: (...args: unknown[]) => intentMocks.submitSignedTwapOrder(...args),
}));

describe("Orbs browser-wallet MCP tools", () => {
  it("registers the new browser-wallet tools with expected categories", () => {
    const categories = Object.fromEntries(
      getOrbsToolDefinitions().map((tool) => [tool.name, tool.category])
    );

    expect(categories.orbs_prepare_swap_intent).toBe("swap");
    expect(categories.orbs_get_required_approvals).toBe("swap");
    expect(categories.orbs_prepare_twap_intent).toBe("orders");
    expect(categories.orbs_prepare_limit_intent).toBe("orders");
    expect(categories.orbs_submit_signed_swap).toBe("swap");
    expect(categories.orbs_submit_signed_twap_order).toBe("orders");
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
        inAmount: "10",
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
      inAmount: "10",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(intentMocks.prepareSwapIntent).toHaveBeenCalledWith({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      inAmount: "10",
      account: "0x1234567890123456789012345678901234567890",
    });
    expect(result.isError).toBe(false);
  });

  it("delegates orbs_submit_signed_twap_order to the shared API", async () => {
    intentMocks.submitSignedTwapOrder.mockResolvedValue({
      orderId: "order-1",
      status: "OPEN",
      txHash: "0xhash",
    });

    const tool = getOrbsToolDefinitions().find(
      (definition) => definition.name === "orbs_submit_signed_twap_order"
    ) as ToolDefinition;
    const result = await tool.handler({
      order: { maker: "0xabc" },
      signature: {
        v: 27,
        r: `0x${"11".repeat(32)}`,
        s: `0x${"22".repeat(32)}`,
      },
    });

    expect(intentMocks.submitSignedTwapOrder).toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });
});
