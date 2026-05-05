import { createRequire } from "node:module";
import type { WalletBackend } from "./backend.js";
import { LegacyWalletBackend } from "./legacy-backend.js";

const defaultRequire = createRequire(import.meta.url);

type PackageResolver = (id: string) => string;

let testResolver: PackageResolver | undefined;
let cachedBackend: WalletBackend | undefined;

function hasConfiguredOwsPassphrase(): boolean {
  const passphrase = process.env.OWS_PASSPHRASE;
  return passphrase !== undefined && passphrase.trim() !== "";
}

export function setOwsPackageResolverForTests(resolver?: PackageResolver): void {
  testResolver = resolver;
}

export function detectOwsAvailability(): boolean {
  if (process.env.OWS_FORCE_LEGACY === "1") {
    return false;
  }
  if (!hasConfiguredOwsPassphrase()) {
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
  OwsWalletBackend: new () => WalletBackend;
}

function isOwsBackendModule(value: unknown): value is OwsBackendModule {
  if (typeof value !== "object" || value === null || !("OwsWalletBackend" in value)) return false;
  return typeof value.OwsWalletBackend === "function";
}

function isWalletBackend(value: unknown): value is WalletBackend {
  if (typeof value !== "object" || value === null) return false;
  if (!("info" in value && "initialize" in value && "getState" in value)) return false;
  if (!("getAccount" in value && "activate" in value && "deactivate" in value)) return false;
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
    typeof value.getKeyForSubprocess === "function"
  );
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (!("code" in error)) return false;
  const code: unknown = error.code;
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}

async function tryLoadOwsBackend(): Promise<WalletBackend | null> {
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

  const instance: unknown = new mod.OwsWalletBackend();
  if (!isWalletBackend(instance)) {
    throw new Error("[wallet] OwsWalletBackend instance does not satisfy WalletBackend interface");
  }
  return instance;
}

export async function selectWalletBackend(): Promise<WalletBackend> {
  if (cachedBackend !== undefined) {
    return cachedBackend;
  }

  if (process.env.OWS_FORCE_LEGACY !== "1" && !hasConfiguredOwsPassphrase()) {
    process.stderr.write("[wallet] OWS passphrase missing or empty; using legacy wallet backend\n");
  }

  if (detectOwsAvailability()) {
    const owsBackend = await tryLoadOwsBackend();
    if (owsBackend !== null) {
      cachedBackend = owsBackend;
      return cachedBackend;
    }
  }

  cachedBackend = new LegacyWalletBackend();
  return cachedBackend;
}

export function getWalletBackend(): WalletBackend {
  if (cachedBackend === undefined) {
    throw new Error("[wallet] No wallet backend selected. Call selectWalletBackend() first.");
  }
  return cachedBackend;
}

export function resetWalletBackend(): void {
  cachedBackend = undefined;
  testResolver = undefined;
}
