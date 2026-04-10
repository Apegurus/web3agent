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
}
