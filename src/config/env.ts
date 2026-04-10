import { AsyncLocalStorage } from "node:async_hooks";
import { isSupported } from "../chains/registry.js";
import type { RuntimeConfig } from "../types/config.js";

export const BLOCKSCOUT_DEFAULT_URL = "https://mcp.blockscout.com/mcp";
export const ETHERSCAN_DEFAULT_URL = "https://mcp.etherscan.io/mcp";

const ETHERSCAN_DEFAULT_API_URL = "https://api.etherscan.io";

export class ValidationError extends Error {
  readonly field: string;
  readonly rawValue: string;

  constructor(field: string, rawValue: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

const FALSE_VALUES = new Set(["false", "0", "no", "off", "disabled"]);

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !FALSE_VALUES.has(value.toLowerCase());
}

function parseIntStrict(field: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError(field, value, `${field} must be an integer, got "${value}"`);
  }
  return parsed;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "on", "enabled"]);

function parsePolicyBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const lower = value.toLowerCase();
  if (FALSE_VALUES.has(lower)) return false;
  if (!TRUE_VALUES.has(lower)) {
    process.stderr.write(
      `[config] Unrecognized policy boolean "${value}" — treating as true. Use true/false/yes/no/on/off/enabled/disabled.\n`
    );
  }
  return true;
}

function parsePositiveFloat(field: string, value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new ValidationError(
      field,
      value,
      `${field} must be a non-negative number, got "${value}"`
    );
  }
  return parsed;
}

const RPC_URL_PREFIX = "RPC_URL_";

function parseChainRpcUrls(env: Partial<Record<string, string>>): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(RPC_URL_PREFIX) && value) {
      const chainId = Number(key.slice(RPC_URL_PREFIX.length));
      if (Number.isInteger(chainId) && chainId > 0) {
        urls[chainId] = value;
      }
    }
  }
  return urls;
}

export function parseEnv(env: Partial<Record<string, string>> = {}): RuntimeConfig {
  const chainId = parseIntStrict("CHAIN_ID", env.CHAIN_ID, 8453);

  if (!isSupported(chainId)) {
    throw new ValidationError(
      "CHAIN_ID",
      env.CHAIN_ID ?? String(chainId),
      `Unsupported chain ID: ${chainId}`
    );
  }

  return {
    chainId,
    privateKey: env.PRIVATE_KEY || undefined,
    mnemonic: env.MNEMONIC || undefined,
    walletAccountIndex: parseIntStrict("WALLET_ACCOUNT_INDEX", env.WALLET_ACCOUNT_INDEX, 0),
    walletAddressIndex: parseIntStrict("WALLET_ADDRESS_INDEX", env.WALLET_ADDRESS_INDEX, 0),
    rpcUrl: env.RPC_URL || undefined,
    chainRpcUrls: parseChainRpcUrls(env),
    confirmWrites: parseBoolean(env.CONFIRM_WRITES, true),
    confirmTtlMinutes: parseIntStrict("CONFIRM_TTL_MINUTES", env.CONFIRM_TTL_MINUTES, 30),
    etherscanApiUrl: env.ETHERSCAN_API_URL || ETHERSCAN_DEFAULT_API_URL,
    etherscanApiKey: env.ETHERSCAN_API_KEY || undefined,
    lifiApiKey: env.LIFI_API_KEY || undefined,
    zeroxApiKey: env.ZEROX_API_KEY || undefined,
    coingeckoApiKey: env.COINGECKO_API_KEY || undefined,
    ccxtConfigPath: env.CCXT_CONFIG_PATH || undefined,
    orbsPartner: env.ORBS_PARTNER || undefined,
    acpContractAddress: env.ACP_CONTRACT_ADDRESS || undefined,
    acpPaymentToken: env.ACP_PAYMENT_TOKEN || undefined,
    pinataJwt: env.PINATA_JWT || undefined,
    erc8004AgentUri: env.ERC8004_AGENT_URI || undefined,
    agdpApiUrl: env.AGDP_API_URL || "https://acpx.virtuals.io/api",
    policyEnabled: parsePolicyBoolean(env.POLICY_ENABLED),
    policyMaxSingleTransactionUsd: parsePositiveFloat(
      "POLICY_MAX_SINGLE_TX_USD",
      env.POLICY_MAX_SINGLE_TX_USD
    ),
    policyMaxHourlyUsd: parsePositiveFloat("POLICY_MAX_HOURLY_USD", env.POLICY_MAX_HOURLY_USD),
    policyMaxDailyUsd: parsePositiveFloat("POLICY_MAX_DAILY_USD", env.POLICY_MAX_DAILY_USD),
    policyMinReserveUsd: parsePositiveFloat("POLICY_MIN_RESERVE_USD", env.POLICY_MIN_RESERVE_USD),
    policyMaxX402PaymentUsd: parsePositiveFloat("POLICY_MAX_X402_USD", env.POLICY_MAX_X402_USD),
  };
}

let cached: RuntimeConfig | undefined;

/**
 * Per-request config scope using AsyncLocalStorage.
 * withConfig() runs a handler inside a store so that concurrent
 * MCP tool calls each read their own config without clobbering
 * the module-level `cached` variable.
 */
const configStore = new AsyncLocalStorage<RuntimeConfig>();

export function setConfig(config: RuntimeConfig): void {
  cached = config;
}

export function resetConfig(): void {
  cached = undefined;
}

export function getConfig(): RuntimeConfig {
  const scoped = configStore.getStore();
  if (scoped) return scoped;
  if (!cached) {
    throw new Error("Config not initialized — call setConfig() during startup");
  }
  return cached;
}

export function tryGetConfig(): RuntimeConfig | undefined {
  return configStore.getStore() ?? cached;
}

export async function withConfig<T>(config: RuntimeConfig, fn: () => Promise<T>): Promise<T> {
  return configStore.run(config, fn);
}

export function withConfigSync<T>(config: RuntimeConfig, fn: () => T): T {
  return configStore.run(config, fn);
}
