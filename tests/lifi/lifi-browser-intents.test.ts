import { describe, expect, it, vi } from "vitest";
import { getLifiToolDefinitions } from "../../src/tools/lifi/index.js";
import type { ToolDefinition } from "../../src/tools/register.js";

const intentMocks = vi.hoisted(() => ({
  prepareBridgeIntent: vi.fn(),
}));

vi.mock("../../src/api/intents.js", () => ({
  prepareBridgeIntent: (...args: unknown[]) => intentMocks.prepareBridgeIntent(...args),
}));

describe("LI.FI browser-wallet MCP tool", () => {
  it("registers lifi_prepare_bridge_intent as a read-only swap tool", () => {
    const tool = getLifiToolDefinitions().find(
      (definition) => definition.name === "lifi_prepare_bridge_intent"
    ) as ToolDefinition;

    expect(tool.category).toBe("swap");
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("delegates lifi_prepare_bridge_intent to the shared API", async () => {
    intentMocks.prepareBridgeIntent.mockResolvedValue({
      steps: [],
      estimate: {
        fromToken: "ETH",
        toToken: "ETH",
        fromAmount: "1",
        toAmount: "1",
        toAmountMin: "1",
      },
      fromChainId: 1,
      toChainId: 8453,
    });

    const tool = getLifiToolDefinitions().find(
      (definition) => definition.name === "lifi_prepare_bridge_intent"
    ) as ToolDefinition;
    const result = await tool.handler({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x1",
      toTokenAddress: "0x2",
      fromAmount: "10",
      account: "0xabc",
    });

    expect(intentMocks.prepareBridgeIntent).toHaveBeenCalledWith({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x1",
      toTokenAddress: "0x2",
      fromAmount: "10",
      account: "0xabc",
    });
    expect(result.isError).toBe(false);
  });
});
