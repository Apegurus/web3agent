import { getConfig } from "../config/env.js";
import { loadCcxtAccountRegistry } from "./config.js";
import { CcxtExchangeFactory } from "./factory.js";
import type { CcxtAccountRegistry } from "./types.js";

export interface CcxtRuntimeState {
  factory: CcxtExchangeFactory;
  registry: CcxtAccountRegistry;
}

/**
 * Keyed by CCXT_CONFIG_PATH. Assumes config is immutable per process lifetime —
 * if the file contents change while the path stays the same, the cached state
 * will be stale until the process restarts.
 */
const runtimeStateCache = new Map<string, CcxtRuntimeState>();

export function getCcxtRuntimeState(): CcxtRuntimeState {
  const config = getConfig();
  const cacheKey = config.ccxtConfigPath ?? "__no-ccxt-config__";
  const cached = runtimeStateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registry = loadCcxtAccountRegistry({ ccxtConfigPath: config.ccxtConfigPath });
  for (const warning of registry.warnings) {
    process.stderr.write(`[ccxt] ${warning}\n`);
  }

  const state: CcxtRuntimeState = {
    factory: new CcxtExchangeFactory(registry),
    registry,
  };
  runtimeStateCache.set(cacheKey, state);
  return state;
}
