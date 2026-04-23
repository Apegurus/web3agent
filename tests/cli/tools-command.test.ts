import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  runToolsCommand: vi.fn(),
  runDoctorCommand: vi.fn(),
  runCreateCli: vi.fn(),
  startServer: vi.fn(),
  withCliRuntime: vi.fn(),
}));

vi.mock("../../src/runtime/startup.js", () => ({
  startServer: (...args: unknown[]) => mockState.startServer(...args),
}));

vi.mock("../../src/cli/runtime.js", () => ({
  withCliRuntime: (...args: unknown[]) => mockState.withCliRuntime(...args),
  createCliRuntime: vi.fn(),
}));

describe("cli command routing", () => {
  const originalArgv = [...process.argv];
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.argv = ["node", "web3agent"];
    mockState.runToolsCommand.mockResolvedValue(undefined);
    mockState.runDoctorCommand.mockResolvedValue(undefined);
    mockState.startServer.mockResolvedValue(undefined);
    vi.doMock("../../src/cli/commands/tools.js", () => ({
      runToolsCommand: (...args: unknown[]) => mockState.runToolsCommand(...args),
    }));
    vi.doMock("../../src/cli/commands/doctor.js", () => ({
      runDoctorCommand: (...args: unknown[]) => mockState.runDoctorCommand(...args),
    }));
    vi.doMock("../../src/create/cli.js", () => ({
      runCreateCli: (...args: unknown[]) => mockState.runCreateCli(...args),
    }));
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    vi.doUnmock("../../src/cli/commands/tools.js");
    vi.doUnmock("../../src/cli/commands/doctor.js");
    vi.doUnmock("../../src/create/cli.js");
  });

  it("routes `web3agent tools list` to the tools command module", async () => {
    process.argv = ["node", "web3agent", "tools", "list"];

    await import("../../src/cli.ts");

    await vi.waitFor(() => {
      expect(mockState.runToolsCommand).toHaveBeenCalledWith(["list"]);
    });
    expect(mockState.runDoctorCommand).not.toHaveBeenCalled();
    expect(mockState.startServer).not.toHaveBeenCalled();
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it("routes `web3agent doctor --json` to the doctor command module", async () => {
    process.argv = ["node", "web3agent", "doctor", "--json"];

    await import("../../src/cli.ts");

    await vi.waitFor(() => {
      expect(mockState.runDoctorCommand).toHaveBeenCalledWith(["--json"]);
    });
    expect(mockState.runToolsCommand).not.toHaveBeenCalled();
    expect(mockState.startServer).not.toHaveBeenCalled();
  });

  it("routes `web3agent tool call ...` to the tools command module", async () => {
    process.argv = ["node", "web3agent", "tool", "call", "resolve_token", "--json"];

    await import("../../src/cli.ts");

    await vi.waitFor(() => {
      expect(mockState.runToolsCommand).toHaveBeenCalledWith(["call", "resolve_token", "--json"]);
    });
    expect(mockState.runDoctorCommand).not.toHaveBeenCalled();
    expect(mockState.startServer).not.toHaveBeenCalled();
  });

  it("routes `web3agent create ...` to the create command module", async () => {
    process.argv = ["node", "web3agent", "create", "starter-app", "--yes"];

    await import("../../src/cli.ts");

    await vi.waitFor(() => {
      expect(mockState.runCreateCli).toHaveBeenCalledWith(["starter-app", "--yes"]);
    });
    expect(mockState.runToolsCommand).not.toHaveBeenCalled();
    expect(mockState.runDoctorCommand).not.toHaveBeenCalled();
    expect(mockState.startServer).not.toHaveBeenCalled();
  });
});

describe("runToolsCommand", () => {
  let stdout = "";
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stdout = "";
  });

  afterEach(() => {
    stdoutWrite.mockClear();
  });

  it("prints a stable JSON catalog for `tools list --json`", async () => {
    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        listTools: () => [
          {
            name: "wallet_generate",
            source: "wallet",
            category: "wallet",
            riskLevel: "safe",
            dynamic: false,
            description: "wallet",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "ccxt_public_call",
            source: "ccxt",
            category: "market",
            riskLevel: "safe",
            dynamic: false,
            description: "invoke a public ccxt method",
            inputSchema: { type: "object", properties: { exchange: { type: "string" } } },
          },
        ],
      })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["list", "--json"]);

    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      data: {
        tools: [
          expect.objectContaining({
            name: "wallet_generate",
            source: "wallet",
            category: "wallet",
            riskLevel: "safe",
          }),
          expect.objectContaining({
            name: "ccxt_public_call",
            source: "ccxt",
            category: "market",
            riskLevel: "safe",
          }),
        ],
      },
    });
  });

  it("prints schema and metadata for `tools describe resolve_token --json`", async () => {
    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        getTool: (name: string) =>
          name === "resolve_token"
            ? {
                name: "resolve_token",
                source: "tokens",
                category: "tokens",
                riskLevel: "safe",
                dynamic: false,
                description: "resolve a token",
                inputSchema: { type: "object", properties: { symbol: { type: "string" } } },
              }
            : undefined,
      })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["describe", "resolve_token", "--json"]);

    const parsed = JSON.parse(stdout);
    expect(parsed.data.tool.name).toBe("resolve_token");
    expect(parsed.data.tool.inputSchema).toBeDefined();
  });
});

describe("runToolsCommand error paths", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  it("throws CliExitError with MISSING_TOOL_NAME for `tools describe` without a name", async () => {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(runToolsCommand(["describe"])).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "MISSING_TOOL_NAME",
    });
  });

  it("throws CliExitError with UNKNOWN_TOOL for `tools describe` with nonexistent tool", async () => {
    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({ getTool: () => undefined })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(runToolsCommand(["describe", "nonexistent_tool"])).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "UNKNOWN_TOOL",
    });
  });

  it("throws CliExitError with MISSING_TOOL_NAME for `tools call` without a name", async () => {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(runToolsCommand(["call"])).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "MISSING_TOOL_NAME",
    });
  });

  it("throws CliExitError with MISSING_INPUT for `tools call` with bare --input flag", async () => {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(runToolsCommand(["call", "some_tool", "--input"])).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "MISSING_INPUT",
    });
  });

  it("throws CliExitError with INVALID_INPUT_JSON for malformed JSON input", async () => {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(
      runToolsCommand(["call", "some_tool", "--input", "{not valid json}"])
    ).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "INVALID_INPUT_JSON",
    });
  });

  it("throws CliExitError with INVALID_INPUT when input is not an object", async () => {
    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");

    await expect(
      runToolsCommand(["call", "some_tool", "--input", '"a string"'])
    ).rejects.toMatchObject({
      name: "CliExitError",
      errorCode: "INVALID_INPUT",
    });
  });

  it("parses tool name correctly when --input flag precedes positional arg", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const invokeTool = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text", text: '{"ok": true}' }],
    }));

    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({ invokeTool })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["call", "--input", "{}", "resolve_token", "--json"]);

    expect(invokeTool).toHaveBeenCalledTimes(1);
    expect(invokeTool).toHaveBeenCalledWith("resolve_token", expect.any(Object));

    stdoutWrite.mockRestore();
  });

  it("writes JSON error when runtime.invokeTool throws", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        invokeTool: () => {
          throw new Error("RPC connection failed");
        },
      })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["call", "some_tool", "--input", "{}"]);

    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: "TOOL_INVOCATION_FAILED",
        message: "RPC connection failed",
      },
    });
    expect(process.exitCode).toBe(1);

    stdoutWrite.mockRestore();
  });

  it("does not set exitCode on successful tool invocation", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        invokeTool: async () => ({
          content: [{ type: "text", text: JSON.stringify({ ok: true, data: { result: "ok" } }) }],
          isError: false,
        }),
      })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["call", "some_tool", "--input", "{}"]);

    expect(process.exitCode).toBe(0);
    stdoutWrite.mockRestore();
    process.exitCode = previousExitCode;
  });

  it("sets exitCode=1 when tool returns an ok:false envelope", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        invokeTool: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: { code: "POLICY_DENIED", message: "spend cap reached" },
              }),
            },
          ],
          isError: true,
        }),
      })
    );

    const { runToolsCommand } = await import("../../src/cli/commands/tools.js");
    await runToolsCommand(["call", "some_tool", "--input", "{}"]);

    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      ok: false,
      error: { code: "POLICY_DENIED", message: "spend cap reached" },
    });
    expect(process.exitCode).toBe(1);

    stdoutWrite.mockRestore();
  });
});
