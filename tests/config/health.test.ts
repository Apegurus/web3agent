import { describe, expect, it } from "vitest";
import {
  createDefaultHealthStatus,
  createStartupReport,
  formatHealthSummary,
  markBackendDegraded,
} from "../../src/config/health.js";

describe("health configuration utilities", () => {
  it("builds default health status with all optional backends not configured", () => {
    expect(createDefaultHealthStatus()).toEqual({
      core: "ok",
      blockscout: { name: "blockscout", status: "not_configured" },
      etherscan: { name: "etherscan", status: "not_configured" },
      evm: { name: "evm", status: "not_configured" },
      goat: { name: "goat", status: "not_configured" },
      lifi: { name: "lifi", status: "not_configured" },
      orbs: { name: "orbs", status: "not_configured" },
    });
  });

  it("creates startup report defaults when partial data is missing", () => {
    const report = createStartupReport({});

    expect(report.health).toEqual(createDefaultHealthStatus());
    expect(report.totalToolCount).toBe(0);
    expect(report.walletMode).toBe("none");
    expect(report.confirmWrites).toBe(true);
    expect(report.activeChainId).toBe(8453);
    expect(report.degradedServices).toEqual([]);
    expect(report.fatalError).toBeUndefined();
  });

  it("preserves explicitly provided startup report values including boundary values", () => {
    const report = createStartupReport({
      health: {
        core: "degraded",
        blockscout: { name: "blockscout", status: "degraded", message: "limited" },
        etherscan: { name: "etherscan", status: "not_configured" },
        evm: { name: "evm", status: "ok" },
        goat: { name: "goat", status: "ok" },
        lifi: { name: "lifi", status: "ok" },
        orbs: { name: "orbs", status: "ok" },
      },
      totalToolCount: 0,
      walletMode: "read-only",
      confirmWrites: false,
      activeChainId: 1,
      degradedServices: ["blockscout"],
      fatalError: "startup failed",
    });

    expect(report.totalToolCount).toBe(0);
    expect(report.walletMode).toBe("read-only");
    expect(report.confirmWrites).toBe(false);
    expect(report.activeChainId).toBe(1);
    expect(report.degradedServices).toEqual(["blockscout"]);
    expect(report.fatalError).toBe("startup failed");
    expect(report.health.core).toBe("degraded");
  });

  it("marks core as degraded without touching backend statuses", () => {
    const health = createDefaultHealthStatus();

    markBackendDegraded(health, "core", "core issue");

    expect(health.core).toBe("degraded");
    expect(health.evm.status).toBe("not_configured");
    expect(health.evm.message).toBeUndefined();
  });

  it("marks a backend degraded and stores message", () => {
    const health = createDefaultHealthStatus();

    markBackendDegraded(health, "orbs", "orbs unavailable");

    expect(health.core).toBe("ok");
    expect(health.orbs.status).toBe("degraded");
    expect(health.orbs.message).toBe("orbs unavailable");
  });

  it("formats structured startup block without degraded services", () => {
    const summary = formatHealthSummary(
      createStartupReport({
        totalToolCount: 12,
        walletMode: "read-only",
        confirmWrites: true,
        activeChainId: 8453,
        degradedServices: [],
      })
    );

    expect(summary).toContain("[web3agent] ─── startup ───");
    expect(summary).toContain("chain:        8453 (Base)");
    expect(summary).toContain("wallet:       read-only");
    expect(summary).toContain("confirmation: enabled");
    expect(summary).toContain("tools:        12 total");
    expect(summary).toContain("[web3agent] ────────────────");
    expect(summary).not.toContain("degraded:");
  });

  it("formats structured startup block with degraded services and wallet address", () => {
    const summary = formatHealthSummary(
      createStartupReport({
        totalToolCount: 5,
        walletMode: "private-key",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        confirmWrites: false,
        activeChainId: 1,
        degradedServices: ["blockscout", "orbs"],
      })
    );

    expect(summary).toContain("chain:        1 (Ethereum)");
    expect(summary).toContain("wallet:       private-key (0x1234...5678)");
    expect(summary).toContain("confirmation: disabled");
    expect(summary).toContain("tools:        5 total");
    expect(summary).toContain("degraded:     blockscout, orbs");
  });

  it("includes pending-ops restored count when present", () => {
    const summary = formatHealthSummary(
      createStartupReport({
        totalToolCount: 10,
        walletMode: "mnemonic",
        activeChainId: 8453,
        degradedServices: [],
        pendingOpsRestored: 3,
      })
    );

    expect(summary).toContain("pending-ops:  3 restored");
  });
});
