import { createRequire } from "node:module";
import { tryGetConfig } from "../config/env.js";
import type { WalletBackend } from "./backend.js";
import { LegacyWalletBackend } from "./legacy-backend.js";
import { hasConfiguredOwsPassphrase } from "./wallet-utils.js";

const defaultRequire = createRequire(import.meta.url);

type PackageResolver = (id: string) => string;

let testResolver: PackageResolver | undefined;

export interface SelectWalletBackendOptions {
  owsPassphrase?: string;
  owsForceLegacy?: boolean;
  vaultPath?: string;
}

interface WalletBackendCacheEntry {
  key: string;
  backend: WalletBackend;
}

let cachedBackends: WalletBackendCacheEntry[] = [];
let lastSelectedBackend: WalletBackend | undefined;

export const NO_WALLET_BACKEND_SELECTED_MESSAGE =
  "[wallet] No wallet backend selected. Call selectWalletBackend() first.";

export function setOwsPackageResolverForTests(resolver?: PackageResolver): void {
  testResolver = resolver;
}

function cacheKey(opts: SelectWalletBackendOptions): string {
  return JSON.stringify({
    p: opts.owsPassphrase ?? null,
    f: opts.owsForceLegacy ?? false,
    v: opts.vaultPath ?? null,
  });
}

function optionsFromCurrentConfig(): SelectWalletBackendOptions | undefined {
  const config = tryGetConfig();
  if (config === undefined) return undefined;
  return {
    owsPassphrase: config.owsPassphrase,
    owsForceLegacy: config.owsForceLegacy,
  };
}

export function detectOwsAvailability(opts: SelectWalletBackendOptions = {}): boolean {
  if (opts.owsForceLegacy || process.env.OWS_FORCE_LEGACY === "1") {
    return false;
  }
  if (process.platform === "win32") {
    return false;
  }
  if (!hasConfiguredOwsPassphrase(opts.owsPassphrase)) {
    return false;
  }
  const resolve = testResolver ?? defaultRequire.resolve;
  try {
    resolve("@open-wallet-standard/core");
    return true;
  } catch {
    return false;
  }
}

interface OwsBackendModule {
  OwsWalletBackend: new (options?: { passphrase?: string; vaultPath?: string }) => WalletBackend;
}

function isOwsBackendModule(value: unknown): value is OwsBackendModule {
  if (typeof value !== "object" || value === null || !("OwsWalletBackend" in value)) return false;
  return typeof value.OwsWalletBackend === "function";
}

function isWalletBackend(value: unknown): value is WalletBackend {
  if (typeof value !== "object" || value === null) return false;
  if (!("info" in value && "initialize" in value && "getState" in value)) return false;
  if (!("getAccount" in value && "activate" in value && "deactivate" in value)) return false;
  if (!("deletePersistedWallet" in value)) return false;
  if (!("getKeyForSubprocess" in value)) return false;
  const info: unknown = value.info;
  return (
    typeof info === "object" &&
    info !== null &&
    "type" in info &&
    typeof info.type === "string" &&
    typeof value.initialize === "function" &&
    typeof value.getState === "function" &&
    typeof value.getAccount === "function" &&
    typeof value.activate === "function" &&
    typeof value.deactivate === "function" &&
    typeof value.deletePersistedWallet === "function" &&
    typeof value.getKeyForSubprocess === "function"
  );
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (!("code" in error)) return false;
  const code: unknown = error.code;
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}

async function tryLoadOwsBackend(
  opts: SelectWalletBackendOptions = {}
): Promise<WalletBackend | null> {
  const owsBackendPath = new URL("./ows-backend.js", import.meta.url).href;

  let mod: unknown;
  try {
    mod = await import(owsBackendPath);
  } catch (error: unknown) {
    if (isModuleNotFoundError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[wallet] OWS backend unavailable, falling back to legacy: ${message}\n`
      );
      return null;
    }
    throw error;
  }

  if (!isOwsBackendModule(mod)) {
    process.stderr.write("[wallet] OWS backend module shape unexpected, falling back to legacy\n");
    return null;
  }

  const instance: unknown = new mod.OwsWalletBackend({
    passphrase: opts.owsPassphrase,
    vaultPath: opts.vaultPath,
  });
  if (!isWalletBackend(instance)) {
    throw new Error("[wallet] OwsWalletBackend instance does not satisfy WalletBackend interface");
  }
  return instance;
}

function chooseLegacyReason(opts: SelectWalletBackendOptions): string {
  if (opts.owsForceLegacy) {
    return "[wallet] Legacy backend selected via OWS_FORCE_LEGACY=1";
  }
  if (process.platform === "win32") {
    return "[wallet] OWS not supported on Windows; using legacy persistence";
  }
  if (!hasConfiguredOwsPassphrase(opts.owsPassphrase)) {
    return "[wallet] OWS_PASSPHRASE not configured; using legacy persistence";
  }
  return "OWS wallet backend unavailable; using legacy persistence fallback";
}

export async function selectWalletBackend(
  opts: SelectWalletBackendOptions = {}
): Promise<WalletBackend> {
  const key = cacheKey(opts);
  const hit = cachedBackends.find((entry) => entry.key === key);
  if (hit) {
    lastSelectedBackend = hit.backend;
    return hit.backend;
  }

  const forceLegacyViaEnv = process.env.OWS_FORCE_LEGACY === "1";
  if (
    !opts.owsForceLegacy &&
    !forceLegacyViaEnv &&
    !hasConfiguredOwsPassphrase(opts.owsPassphrase)
  ) {
    process.stderr.write("[wallet] OWS passphrase missing or empty; using legacy wallet backend\n");
  }

  if (detectOwsAvailability(opts)) {
    const owsBackend = await tryLoadOwsBackend(opts);
    if (owsBackend !== null) {
      cachedBackends.push({ key, backend: owsBackend });
      lastSelectedBackend = owsBackend;
      return owsBackend;
    }
    const fallback = new LegacyWalletBackend(
      "[wallet] OWS module unavailable despite OWS_PASSPHRASE being set; using legacy fallback"
    );
    cachedBackends.push({ key, backend: fallback });
    lastSelectedBackend = fallback;
    return fallback;
  }

  const legacy = new LegacyWalletBackend(
    chooseLegacyReason({ ...opts, owsForceLegacy: opts.owsForceLegacy || forceLegacyViaEnv })
  );
  cachedBackends.push({ key, backend: legacy });
  lastSelectedBackend = legacy;
  return legacy;
}

export function getWalletBackend(): WalletBackend {
  const opts = optionsFromCurrentConfig();
  if (opts !== undefined) {
    const hit = cachedBackends.find((entry) => entry.key === cacheKey(opts));
    if (hit) return hit.backend;
  }
  if (lastSelectedBackend === undefined) {
    throw new Error(NO_WALLET_BACKEND_SELECTED_MESSAGE);
  }
  return lastSelectedBackend;
}

export function resetWalletBackend(): void {
  cachedBackends = [];
  lastSelectedBackend = undefined;
  testResolver = undefined;
}
