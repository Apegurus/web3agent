import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  runToolsCommand: vi.fn(),
  runDoctorCommand: vi.fn(),
  startServer: vi.fn(),
}));

vi.mock("../../src/cli/commands/tools.js", () => ({
  runToolsCommand: (...args: unknown[]) => mockState.runToolsCommand(...args),
}), { virtual: true });

vi.mock("../../src/cli/commands/doctor.js", () => ({
  runDoctorCommand: (...args: unknown[]) => mockState.runDoctorCommand(...args),
}), { virtual: true });

vi.mock("../../src/runtime/startup.js", () => ({
  startServer: (...args: unknown[]) => mockState.startServer(...args),
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
  });

  afterEach(() => {
    process.argv = [...originalArgv];
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
});
