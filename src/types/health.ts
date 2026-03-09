export type BackendStatusCode = "ok" | "degraded" | "unavailable" | "not_configured";

export interface BackendStatus {
  name: string;
  status: BackendStatusCode;
  message?: string;
  toolCount?: number;
}

export interface HealthStatus {
  core: BackendStatusCode;
  blockscout: BackendStatus;
  etherscan: BackendStatus;
  evm: BackendStatus;
  goat: BackendStatus;
  lifi: BackendStatus;
  orbs: BackendStatus;
}

export interface StartupReport {
  health: HealthStatus;
  totalToolCount: number;
  walletMode: string;
  confirmWrites: boolean;
  activeChainId: number;
  degradedServices: string[];
  fatalError?: string;
}

export function formatHealthSummary(report: StartupReport): string {
  const lines: string[] = [
    `[web3agent] Starting on chain ${report.activeChainId}, wallet: ${report.walletMode}, confirm: ${report.confirmWrites}`,
    `[web3agent] Tools: ${report.totalToolCount} loaded`,
  ];
  if (report.degradedServices.length > 0) {
    lines.push(`[web3agent] Degraded: ${report.degradedServices.join(", ")}`);
  }
  return lines.join("\n");
}
