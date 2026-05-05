export interface CcxtAccountConfig {
  name: string;
  exchangeId: string;
  apiKey?: string;
  secret?: string;
  password?: string;
  uid?: string;
  privateKey?: string;
  walletAddress?: string;
  defaultType?: "spot" | "margin" | "future" | "swap" | "option";
  sandbox?: boolean;
  enableRateLimit?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface CcxtAccountRegistry {
  accounts: CcxtAccountConfig[];
  warnings: string[];
  insecurePermissions: boolean;
  configPath?: string;
}

export interface CcxtExchangeLike {
  id: string;
  name?: string;
  has?: Record<string, boolean | "emulated" | undefined>;
  options?: Record<string, unknown>;
  timeframes?: Record<string, string>;
  markets?: Record<string, unknown>;
  symbols?: string[];
  loadMarkets: (reload?: boolean) => Promise<unknown>;
  setSandboxMode?: (enabled: boolean) => void;
  setMarketsFromExchange?: (exchange: CcxtExchangeLike) => void;
  [method: string]: unknown;
}
