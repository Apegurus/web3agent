import { isSupported } from "../chains/registry.js";
import type { RuntimeConfig } from "../types/config.js";

export const BLOCKSCOUT_DEFAULT_URL = "https://mcp.blockscout.com/mcp";
export const ETHERSCAN_DEFAULT_URL = "https://mcp.etherscan.io/mcp";

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

const FALSE_VALUES = new Set(["false", "0", "no"]);

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
    blockscoutMcpUrl: env.BLOCKSCOUT_MCP_URL || BLOCKSCOUT_DEFAULT_URL,
    etherscanMcpUrl: env.ETHERSCAN_MCP_URL || ETHERSCAN_DEFAULT_URL,
    etherscanApiKey: env.ETHERSCAN_API_KEY || undefined,
    lifiApiKey: env.LIFI_API_KEY || undefined,
    zeroxApiKey: env.ZEROX_API_KEY || undefined,
    coingeckoApiKey: env.COINGECKO_API_KEY || undefined,
    orbsPartner: env.ORBS_PARTNER || undefined,
  };
}

let cached: RuntimeConfig | undefined;

export function getConfig(): RuntimeConfig {
  if (!cached) {
    cached = parseEnv(process.env as Partial<Record<string, string>>);
  }
  return cached;
}
