import { describe, expect, it, vi } from "vitest";
import { dispatchGoatTool } from "../../src/goat/dispatch.js";

vi.mock("../../src/goat/provider.js", () => ({
  goatProvider: {
    getOrBuildSnapshot: vi.fn().mockImplementation(async (chainId: number) => {
      if (chainId === 8453) {
        return {
          listOfTools: [],
          toolHandler: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
          }),
          chainId: 8453,
        };
      }
      return undefined;
    }),
  },
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 8453 }),
}));

vi.mock("../../src/chains/registry.js", () => ({
  isSupported: vi.fn().mockImplementation((id: number) => {
    return [1, 8453, 137, 42161, 10, 56].includes(id);
  }),
}));

describe("dispatchGoatTool — chain unavailability", () => {
  it("returns structured error for unsupported chain", async () => {
    const result = await dispatchGoatTool("uniswap_swap", {
      chainId: 9999999,
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.error).toBe("UNSUPPORTED_CHAIN");
  });

  it("returns TOOL_UNAVAILABLE_ON_CHAIN for wrong chain", async () => {
    const result = await dispatchGoatTool("uniswap_swap", { chainId: 56 });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.error).toBe("TOOL_UNAVAILABLE_ON_CHAIN");
    expect(parsed.details.availableChainIds).toBeDefined();
  });

  it("returns CHAIN_INIT_FAILED when no snapshot exists", async () => {
    const result = await dispatchGoatTool("erc20_balance", { chainId: 1 });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.error).toBe("CHAIN_INIT_FAILED");
  });

  it("dispatches successfully when chain and tool match", async () => {
    const result = await dispatchGoatTool("erc20_balance", { chainId: 8453 });
    expect(result.isError).toBeUndefined();
    expect((result.content[0] as { type: string; text: string }).text).toBe("ok");
  });

  it("uses config chainId as default when params.chainId is absent", async () => {
    const result = await dispatchGoatTool("erc20_balance", {});
    expect(result.isError).toBeUndefined();
    expect((result.content[0] as { type: string; text: string }).text).toBe("ok");
  });
});
