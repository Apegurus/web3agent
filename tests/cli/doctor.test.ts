import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  withCliRuntime: vi.fn(),
}));

vi.mock("../../src/cli/runtime.js", () => ({
  withCliRuntime: (...args: unknown[]) => mockState.withCliRuntime(...args),
  createCliRuntime: vi.fn(),
}));

function createHealthyRuntime() {
  return {
    getHealth: () => ({
      activeChainId: 8453,
      walletMode: "read-only",
      confirmWrites: true,
      toolCount: 12,
      backends: {
        explorer: {
          name: "block-explorer",
          status: "ok",
          toolCount: 3,
          backends: {
            blockscout: { status: "ok", chainCount: 8 },
            etherscan: { status: "not_configured", chainCount: 0 },
          },
        },
        blockscout: { name: "blockscout", status: "ok", toolCount: 1 },
        etherscan: { name: "etherscan", status: "not_configured" },
        evm: { name: "evm", status: "ok", toolCount: 2 },
        goat: { name: "goat", status: "ok", toolCount: 4 },
        lifi: { name: "lifi", status: "ok", toolCount: 1 },
        orbs: { name: "orbs", status: "ok", toolCount: 1 },
        agenticEconomy: { name: "agentic-economy", status: "ok", toolCount: 1 },
      },
    }),
  };
}

describe("runDoctorCommand", () => {
  let stdout = "";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run(createHealthyRuntime())
    );
  });

  it("prints machine-readable backend and tool health with --json", async () => {
    const { runDoctorCommand } = await import("../../src/cli/commands/doctor.js");
    await runDoctorCommand(["--json"]);

    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.health.backends).toBeDefined();
  });

  it("returns actionable diagnostics when a backend is degraded", async () => {
    mockState.withCliRuntime.mockImplementation(async (run: (runtime: unknown) => Promise<void>) =>
      run({
        getHealth: () => ({
          ...createHealthyRuntime().getHealth(),
          backends: {
            ...createHealthyRuntime().getHealth().backends,
            lifi: {
              name: "lifi",
              status: "degraded",
              message: "LI.FI quote service unavailable",
              toolCount: 1,
            },
          },
        }),
      })
    );

    const { runDoctorCommand } = await import("../../src/cli/commands/doctor.js");
    await runDoctorCommand(["--json"]);

    const parsed = JSON.parse(stdout);
    expect(parsed.data.issues).toContainEqual(
      expect.objectContaining({ code: expect.any(String), fix: expect.any(String) })
    );
  });
});
