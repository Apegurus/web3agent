import type { BackendStatusCode, HealthStatus, StartupReport } from "../types/health.js";

export { formatHealthSummary } from "../types/health.js";

export function createDefaultHealthStatus(): HealthStatus {
  return {
    core: "ok",
    blockscout: { name: "blockscout", status: "not_configured" },
    etherscan: { name: "etherscan", status: "not_configured" },
    evm: { name: "evm", status: "not_configured" },
    goat: { name: "goat", status: "not_configured" },
    lifi: { name: "lifi", status: "not_configured" },
    orbs: { name: "orbs", status: "not_configured" },
  };
}

export function createStartupReport(partial: Partial<StartupReport>): StartupReport {
  return {
    health: partial.health ?? createDefaultHealthStatus(),
    totalToolCount: partial.totalToolCount ?? 0,
    walletMode: partial.walletMode ?? "none",
    confirmWrites: partial.confirmWrites ?? true,
    activeChainId: partial.activeChainId ?? 8453,
    degradedServices: partial.degradedServices ?? [],
    fatalError: partial.fatalError,
  };
}

export function markBackendDegraded(
  health: HealthStatus,
  backend: keyof HealthStatus,
  message: string
): void {
  if (backend === "core") {
    health.core = "degraded";
    return;
  }
  health[backend].status = "degraded";
  health[backend].message = message;
}
