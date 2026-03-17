export type BackendStatusCode = "ok" | "degraded" | "unavailable" | "not_configured";

export interface BackendStatus {
  name: string;
  status: BackendStatusCode;
  message?: string;
  toolCount?: number;
}

export interface ExplorerBackendHealth {
  status: BackendStatusCode;
  chainCount: number;
  message?: string;
}

export interface ExplorerHealth extends BackendStatus {
  backends: {
    blockscout: ExplorerBackendHealth;
    etherscan: ExplorerBackendHealth;
  };
}

export interface HealthStatus {
  core: BackendStatusCode;
  explorer: ExplorerHealth;
  blockscout: BackendStatus;
  etherscan: BackendStatus;
  evm: BackendStatus;
  goat: BackendStatus;
  lifi: BackendStatus;
  orbs: BackendStatus;
  agenticEconomy: BackendStatus;
}

export interface StartupReport {
  health: HealthStatus;
  totalToolCount: number;
  walletMode: string;
  walletAddress?: string;
  confirmWrites: boolean;
  activeChainId: number;
  degradedServices: string[];
  pendingOpsRestored?: number;
  fatalError?: string;
}
