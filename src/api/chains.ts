import { getChainById, getChainByName, isSupported } from "../chains/registry.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  ChainLookupResult,
  RuntimeBoundOptions,
  SupportedChainEntry,
  SupportedChainsResult,
} from "./types.js";

export function getChain(id: number): ChainLookupResult {
  return getChainById(id);
}

export function findChainByName(name: string): ChainLookupResult {
  return getChainByName(name);
}

export function isSupportedChain(chainId: number): boolean {
  return isSupported(chainId);
}

export async function listSupportedChains(
  options?: RuntimeBoundOptions
): Promise<SupportedChainsResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<SupportedChainsResult>(runtime, "list_supported_chains");
}

export async function listSupportedChainEntries(
  options?: RuntimeBoundOptions
): Promise<SupportedChainEntry[]> {
  const result = await listSupportedChains(options);
  return result.chains;
}
