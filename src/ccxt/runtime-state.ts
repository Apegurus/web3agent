import { getConfig } from "../config/env.js";
import { loadCcxtAccountRegistry } from "./config.js";
import { CcxtExchangeFactory } from "./factory.js";
import type { CcxtAccountRegistry } from "./types.js";

export interface CcxtRuntimeState {
  factory: CcxtExchangeFactory;
  registry: CcxtAccountRegistry;
}

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
