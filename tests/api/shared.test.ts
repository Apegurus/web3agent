import { beforeEach, describe, expect, it, vi } from "vitest";
import { Web3AgentError } from "../../src/api/errors.js";

const mocks = vi.hoisted(() => ({
  getDefaultRuntime: vi.fn(),
  getToolResultPayload: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: mocks.getDefaultRuntime,
}));

vi.mock("../../src/utils/tool-results.js", () => ({
  getToolResultPayload: mocks.getToolResultPayload,
}));

import { createSDKInvoker, getRuntime, invokeAndRequireData } from "../../src/api/shared.js";

describe("api/shared", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRuntime returns options.runtime when provided", async () => {
    const runtime = { invokeTool: vi.fn() };

    const result = await getRuntime({ runtime } as never);

    expect(result).toBe(runtime);
    expect(mocks.getDefaultRuntime).not.toHaveBeenCalled();
  });

  it("getRuntime returns default runtime when options are omitted", async () => {
    const runtime = { invokeTool: vi.fn() };
    mocks.getDefaultRuntime.mockResolvedValue(runtime);

    const result = await getRuntime();

    expect(mocks.getDefaultRuntime).toHaveBeenCalledOnce();
    expect(result).toBe(runtime);
  });

  it("invokeAndRequireData returns payload.data on success", async () => {
    const runtime = {
      invokeTool: vi.fn().mockResolvedValue({}),
    };
    const payload = { ok: true, data: { quote: "ok" } };
    mocks.getToolResultPayload.mockReturnValue(payload);

    const result = await invokeAndRequireData<typeof payload.data>(runtime as never, "tool_name", {
      amount: "1",
    });

    expect(runtime.invokeTool).toHaveBeenCalledWith("tool_name", { amount: "1" });
    expect(mocks.getToolResultPayload).toHaveBeenCalled();
    expect(result).toEqual(payload.data);
  });

  it("invokeAndRequireData throws Web3AgentError on tool failure", async () => {
    const runtime = {
      invokeTool: vi.fn().mockResolvedValue({}),
    };
    mocks.getToolResultPayload.mockReturnValue({
      ok: false,
      error: {
        code: "TOOL_FAILED",
        message: "boom",
        details: { reason: "mocked" },
      },
    });

    await expect(invokeAndRequireData(runtime as never, "tool_name", {})).rejects.toBeInstanceOf(
      Web3AgentError
    );
    await expect(invokeAndRequireData(runtime as never, "tool_name", {})).rejects.toMatchObject({
      code: "TOOL_FAILED",
      message: "boom",
      details: { reason: "mocked" },
    });
  });

  it("createSDKInvoker returns function that resolves runtime and invokes tool", async () => {
    const runtime = {
      invokeTool: vi.fn().mockResolvedValue({}),
    };
    mocks.getDefaultRuntime.mockResolvedValue(runtime);
    mocks.getToolResultPayload.mockReturnValue({
      ok: true,
      data: { status: "ok" },
    });

    const invokeMyTool = createSDKInvoker<{ fromToken: string }, { status: string }>(
      "orbs_get_quote"
    );
    const result = await invokeMyTool({ fromToken: "ETH" });

    expect(mocks.getDefaultRuntime).toHaveBeenCalledOnce();
    expect(runtime.invokeTool).toHaveBeenCalledWith("orbs_get_quote", { fromToken: "ETH" });
    expect(result).toEqual({ status: "ok" });
  });
});
