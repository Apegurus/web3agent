import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateInput: vi.fn(),
  formatToolResponse: vi.fn(),
  formatToolErrorFromUnknown: vi.fn(),
  handler: vi.fn(),
}));

vi.mock("../../../src/utils/validation.js", () => ({
  validateInput: mocks.validateInput,
}));

vi.mock("../../../src/utils/errors.js", () => ({
  formatToolResponse: mocks.formatToolResponse,
  formatToolErrorFromUnknown: mocks.formatToolErrorFromUnknown,
}));

import { createToolHandler } from "../../../src/tools/shared/handler-factory.js";

describe("createToolHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted handler result for valid input", async () => {
    const validatedInput = { foo: "bar" };
    const handlerResult = { ok: true };
    const formattedResult = {
      content: [{ type: "text", text: "ok" }],
      structuredContent: { ok: true, data: handlerResult },
      isError: false,
    };

    mocks.validateInput.mockReturnValue({ success: true, data: validatedInput });
    mocks.handler.mockResolvedValue(handlerResult);
    mocks.formatToolResponse.mockReturnValue(formattedResult);

    const wrapped = createToolHandler({} as never, mocks.handler, "HANDLER_ERROR");
    const result = await wrapped({ foo: "bar" });

    expect(mocks.validateInput).toHaveBeenCalledWith(expect.anything(), { foo: "bar" });
    expect(mocks.handler).toHaveBeenCalledWith(validatedInput);
    expect(mocks.formatToolResponse).toHaveBeenCalledWith(handlerResult);
    expect(result).toBe(formattedResult);
  });

  it("returns validation error when input is invalid", async () => {
    const validationError = {
      content: [{ type: "text", text: "invalid" }],
      structuredContent: { ok: false, error: { code: "INVALID_PARAMS", message: "invalid" } },
      isError: true,
    };

    mocks.validateInput.mockReturnValue({ success: false, error: validationError });

    const wrapped = createToolHandler({} as never, mocks.handler, "HANDLER_ERROR");
    const result = await wrapped({ bad: "input" });

    expect(mocks.handler).not.toHaveBeenCalled();
    expect(mocks.formatToolResponse).not.toHaveBeenCalled();
    expect(mocks.formatToolErrorFromUnknown).not.toHaveBeenCalled();
    expect(result).toBe(validationError);
  });

  it("returns formatted error when handler throws", async () => {
    const thrown = new Error("boom");
    const formattedError = {
      content: [{ type: "text", text: "boom" }],
      structuredContent: { ok: false, error: { code: "HANDLER_ERROR", message: "boom" } },
      isError: true,
    };

    mocks.validateInput.mockReturnValue({ success: true, data: { foo: "bar" } });
    mocks.handler.mockRejectedValue(thrown);
    mocks.formatToolErrorFromUnknown.mockReturnValue(formattedError);

    const wrapped = createToolHandler({} as never, mocks.handler, "HANDLER_ERROR");
    const result = await wrapped({ foo: "bar" });

    expect(mocks.formatToolErrorFromUnknown).toHaveBeenCalledWith("HANDLER_ERROR", thrown);
    expect(result).toBe(formattedError);
  });
});
