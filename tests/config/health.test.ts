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

  it("formats health summary without degraded services line when none exist", () => {
    const summary = formatHealthSummary(
      createStartupReport({
        totalToolCount: 12,
        walletMode: "read-only",
        confirmWrites: true,
        activeChainId: 8453,
        degradedServices: [],
      })
    );

    expect(summary).toBe(
      "[web3agent] Starting on chain 8453, wallet: read-only, confirm: true\n[web3agent] Tools: 12 loaded"
    );
  });

  it("formats health summary including degraded services line", () => {
    const summary = formatHealthSummary(
      createStartupReport({
        totalToolCount: 5,
        walletMode: "none",
        confirmWrites: false,
        activeChainId: 1,
        degradedServices: ["blockscout", "orbs"],
      })
    );

    expect(summary).toBe(
      "[web3agent] Starting on chain 1, wallet: none, confirm: false\n[web3agent] Tools: 5 loaded\n[web3agent] Degraded: blockscout, orbs"
    );
  });
});
