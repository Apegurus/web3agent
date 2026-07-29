import { beforeEach, describe, expect, it, vi } from "vitest";

import * as publicSchemas from "../../src/api/schemas/uniswap-v4.js";

const runtimeMocks = vi.hoisted(() => ({
  invokeTool: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn().mockResolvedValue({
    invokeTool: (...args: unknown[]) => runtimeMocks.invokeTool(...args),
  }),
}));

describe("Uniswap v4 root SDK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given the read and lifecycle simulation capabilities, when imported from the root API, then each is a runtime-backed SDK function", async () => {
    const root = await import("../../src/index.js");

    expect(typeof root.getUniswapV4Deployment).toBe("function");
    expect(typeof root.getUniswapV4Pool).toBe("function");
    expect(typeof root.getUniswapV4Position).toBe("function");
    expect(typeof root.getUniswapV4Events).toBe("function");
    expect(typeof root.calculateUniswapV4Position).toBe("function");
    expect(typeof root.calculateUniswapV4).toBe("function");
    expect(typeof root.simulateUniswapV4Operation).toBe("function");
  });

  it("Given the public Uniswap v4 schema barrel, when imported from the root API, then every public schema remains available", async () => {
    const root = await import("../../src/index.js");

    for (const schemaName of Object.keys(publicSchemas)) {
      expect(schemaName in root).toBe(true);
    }
  });

  it("Given an unsupported chain runtime response, when deployment is requested through the SDK, then preserves its MCP error code", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      content: [],
      isError: true,
      structuredContent: {
        error: {
          code: "UNISWAP_V4_UNAVAILABLE",
          message: "Uniswap v4 is not verified on chain 1",
        },
        ok: false,
      },
    });
    const { getUniswapV4Deployment } = await import("../../src/api/uniswap-v4.js");

    await expect(getUniswapV4Deployment({ chainId: 1 })).rejects.toMatchObject({
      code: "UNISWAP_V4_UNAVAILABLE",
    });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("uniswap_v4_get_deployment", {
      chainId: 1,
    });
  });
});
