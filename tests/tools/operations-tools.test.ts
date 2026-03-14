import { beforeEach, describe, expect, it, vi } from "vitest";

const operationMocks = vi.hoisted(() => ({
  prepareOperation: vi.fn(),
  resumeOperation: vi.fn(),
}));

vi.mock("../../src/api/operations.js", () => ({
  prepareOperation: (...args: unknown[]) => operationMocks.prepareOperation(...args),
  resumeOperation: (...args: unknown[]) => operationMocks.resumeOperation(...args),
}));

describe("operation MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers operation_prepare and operation_resume as operation tools", async () => {
    const { getOperationToolDefinitions } = await import("../../src/tools/operations/index.js");
    const definitions = getOperationToolDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual([
      "operation_prepare",
      "operation_resume",
    ]);
    expect(definitions.map((definition) => definition.category)).toEqual([
      "operation",
      "operation",
    ]);
  });

  it("operation_prepare delegates to the shared operations API", async () => {
    operationMocks.prepareOperation.mockResolvedValue({
      integration: "orbs",
      kind: "swap",
      summary: "Prepared swap",
      actions: [],
      resumeState: {
        version: 1,
        integration: "orbs",
        kind: "swap",
        state: {},
      },
    });

    const { getOperationToolDefinitions } = await import("../../src/tools/operations/index.js");
    const definition = getOperationToolDefinitions().find(
      (tool) => tool.name === "operation_prepare"
    );
    const result = await definition?.handler({
      integration: "orbs",
      kind: "swap",
      chainId: 8453,
      fromToken: "0x1",
      toToken: "0x2",
      inAmount: "100",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(operationMocks.prepareOperation).toHaveBeenCalled();
    expect(result?.isError).toBe(false);
    expect(JSON.parse(String(result?.content[0]?.text)).summary).toBe("Prepared swap");
  });

  it("operation_resume forwards Web3AgentError responses cleanly", async () => {
    const { Web3AgentError } = await import("../../src/api/errors.js");
    operationMocks.resumeOperation.mockRejectedValue(
      new Web3AgentError({
        code: "GOAT_TOOL_ERROR",
        message: "resume failed",
        details: { toolName: "swap_on_balancer" },
      })
    );

    const { getOperationToolDefinitions } = await import("../../src/tools/operations/index.js");
    const definition = getOperationToolDefinitions().find(
      (tool) => tool.name === "operation_resume"
    );
    const result = await definition?.handler({
      resumeState: {
        version: 1,
        integration: "goat",
        kind: "tool",
        state: {
          toolName: "swap_on_balancer",
          chainId: 8453,
          account: "0x1234567890123456789012345678901234567890",
          params: {},
        },
      },
    });

    expect(result?.isError).toBe(true);
    const payload = JSON.parse(String(result?.content[0]?.text));
    expect(payload.error).toBe("GOAT_TOOL_ERROR");
  });
});
