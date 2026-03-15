import { getChainById } from "../chains/registry.js";
import type { HealthStatus, StartupReport } from "../types/health.js";
import { VERSION } from "../version.js";

function formatAdapterLine(name: string, status: { status: string; toolCount?: number }): string {
  const count = status.toolCount != null ? ` (${status.toolCount} tools)` : "";
  return `    ${name.padEnd(14)} ${status.status}${count}`;
}

function maskAddress(address?: string): string {
  if (!address) return "none";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatHealthSummary(report: StartupReport): string {
  const chain = getChainById(report.activeChainId);
  const chainLabel = chain
    ? `${report.activeChainId} (${chain.name})`
    : String(report.activeChainId);
  const walletLabel = report.walletAddress
    ? `${report.walletMode} (${maskAddress(report.walletAddress)})`
    : report.walletMode;

  const lines: string[] = [
    "[web3agent] ─── startup ───",
    `  version:      ${VERSION}`,
    `  chain:        ${chainLabel}`,
    `  wallet:       ${walletLabel}`,
    `  confirmation: ${report.confirmWrites ? "enabled" : "disabled"}`,
    "  adapters:",
    formatAdapterLine("blockscout", report.health.blockscout),
    formatAdapterLine("etherscan", report.health.etherscan),
    formatAdapterLine("evm", report.health.evm),
    formatAdapterLine("goat", report.health.goat),
    formatAdapterLine("lifi", report.health.lifi),
    formatAdapterLine("orbs", report.health.orbs),
    formatAdapterLine("agentic-economy", report.health.agenticEconomy),
    `  tools:        ${report.totalToolCount} total`,
  ];

  if (report.pendingOpsRestored && report.pendingOpsRestored > 0) {
    lines.push(`  pending-ops:  ${report.pendingOpsRestored} restored`);
  }

  if (report.degradedServices.length > 0) {
    lines.push(`  degraded:     ${report.degradedServices.join(", ")}`);
  }

  lines.push("[web3agent] ────────────────");

  return lines.join("\n");
}

export function createDefaultHealthStatus(): HealthStatus {
  return {
    core: "ok",
    blockscout: { name: "blockscout", status: "not_configured" },
    etherscan: { name: "etherscan", status: "not_configured" },
    evm: { name: "evm", status: "not_configured" },
    goat: { name: "goat", status: "not_configured" },
    lifi: { name: "lifi", status: "not_configured" },
    orbs: { name: "orbs", status: "not_configured" },
    agenticEconomy: { name: "agentic-economy", status: "not_configured" },
  };
}

export function createStartupReport(partial: Partial<StartupReport>): StartupReport {
  return {
    health: partial.health ?? createDefaultHealthStatus(),
    totalToolCount: partial.totalToolCount ?? 0,
    walletMode: partial.walletMode ?? "none",
    walletAddress: partial.walletAddress,
    confirmWrites: partial.confirmWrites ?? true,
    activeChainId: partial.activeChainId ?? 8453,
    degradedServices: partial.degradedServices ?? [],
    pendingOpsRestored: partial.pendingOpsRestored,
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
