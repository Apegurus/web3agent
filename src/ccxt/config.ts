import { existsSync, readFileSync, statSync } from "node:fs";
import ccxt from "ccxt";
import type { RuntimeConfig } from "../types/config.js";
import { isPlainObject } from "../utils/type-guards.js";
import type { CcxtAccountConfig, CcxtAccountRegistry } from "./types.js";

interface RawCcxtConfigFile {
  accounts?: unknown;
}

function normalizeAccount(value: unknown): CcxtAccountConfig | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const { name, exchangeId } = value;
  if (typeof name !== "string" || name.length === 0) {
    return null;
  }
  if (typeof exchangeId !== "string" || exchangeId.length === 0) {
    return null;
  }

  return {
    name,
    exchangeId,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : undefined,
    secret: typeof value.secret === "string" ? value.secret : undefined,
    password: typeof value.password === "string" ? value.password : undefined,
    uid: typeof value.uid === "string" ? value.uid : undefined,
    privateKey: typeof value.privateKey === "string" ? value.privateKey : undefined,
    walletAddress: typeof value.walletAddress === "string" ? value.walletAddress : undefined,
    defaultType:
      value.defaultType === "spot" ||
      value.defaultType === "margin" ||
      value.defaultType === "future" ||
      value.defaultType === "swap" ||
      value.defaultType === "option"
        ? value.defaultType
        : undefined,
    sandbox: typeof value.sandbox === "boolean" ? value.sandbox : undefined,
    enableRateLimit: typeof value.enableRateLimit === "boolean" ? value.enableRateLimit : undefined,
    timeout: typeof value.timeout === "number" ? value.timeout : undefined,
    headers: isPlainObject(value.headers)
      ? Object.entries(value.headers).reduce<Record<string, string>>(
          (headers, [key, headerValue]) => {
            if (typeof headerValue === "string") {
              headers[key] = headerValue;
            }
            return headers;
          },
          {}
        )
      : undefined,
    options: isPlainObject(value.options) ? value.options : undefined,
  };
}

export function loadCcxtAccountRegistry(
  config: Pick<RuntimeConfig, "ccxtConfigPath">
): CcxtAccountRegistry {
  if (!config.ccxtConfigPath) {
    return {
      accounts: [],
      warnings: [],
      insecurePermissions: false,
    };
  }

  if (!existsSync(config.ccxtConfigPath)) {
    return {
      accounts: [],
      warnings: [`CCXT config file not found: ${config.ccxtConfigPath}`],
      insecurePermissions: false,
    };
  }

  let insecurePermissions = false;
  try {
    const stats = statSync(config.ccxtConfigPath);
    const mode = stats.mode & 0o777;
    if (mode & 0o077) {
      insecurePermissions = true;
      process.stderr.write(
        `[ccxt] WARNING: ${config.ccxtConfigPath} is readable by other users (mode ${mode.toString(8)}). ` +
          `This file contains exchange credentials. Run: chmod 600 ${config.ccxtConfigPath}\n`
      );
    }
    // biome-ignore lint/suspicious/noEmptyBlockStatements: permission check is best-effort
  } catch {}

  let parsed: RawCcxtConfigFile;
  try {
    parsed = JSON.parse(readFileSync(config.ccxtConfigPath, "utf-8")) as RawCcxtConfigFile;
  } catch (error: unknown) {
    return {
      accounts: [],
      warnings: [
        `Failed to parse CCXT config file ${config.ccxtConfigPath}: ${error instanceof Error ? error.message : String(error)}`,
      ],
      insecurePermissions: false,
    };
  }

  if (!Array.isArray(parsed.accounts)) {
    return {
      accounts: [],
      warnings: [`CCXT config file ${config.ccxtConfigPath} must contain an accounts array`],
      insecurePermissions: false,
    };
  }

  const supportedExchanges = new Set(ccxt.exchanges);
  const seenNames = new Set<string>();
  const accounts: CcxtAccountConfig[] = [];
  const warnings: string[] = [];

  for (const rawAccount of parsed.accounts) {
    const account = normalizeAccount(rawAccount);
    if (!account) {
      warnings.push(`Skipping invalid CCXT account entry in ${config.ccxtConfigPath}`);
      continue;
    }
    if (seenNames.has(account.name)) {
      warnings.push(`Duplicate account name '${account.name}' in ${config.ccxtConfigPath}`);
      continue;
    }
    if (!supportedExchanges.has(account.exchangeId)) {
      warnings.push(
        `Unsupported exchange ID '${account.exchangeId}' for account '${account.name}'`
      );
      continue;
    }

    seenNames.add(account.name);
    accounts.push(account);
  }

  return {
    accounts,
    warnings,
    insecurePermissions,
  };
}
