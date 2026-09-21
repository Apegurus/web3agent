import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { arc } from "./arc.js";

const CHAINS_BY_ID = new Map<number, Chain>();
const CHAINS_BY_NAME = new Map<string, Chain>();

for (const value of Object.values(viemChains)) {
  if (value && typeof value === "object" && "id" in value && "name" in value) {
    const chain = value as Chain;
    CHAINS_BY_ID.set(chain.id, chain);
    CHAINS_BY_NAME.set(chain.name.toLowerCase(), chain);
  }
}

CHAINS_BY_ID.set(arc.id, arc);
CHAINS_BY_NAME.set(arc.name.toLowerCase(), arc);

export function getChainById(id: number): Chain | undefined {
  return CHAINS_BY_ID.get(id);
}

export function getRequiredChain(chainId: number): Chain {
  const chain = getChainById(chainId);
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  return chain;
}

export function getChainByName(name: string): Chain | undefined {
  return CHAINS_BY_NAME.get(name.toLowerCase());
}

export function getRegisteredChains(): readonly Chain[] {
  return [...CHAINS_BY_ID.values()];
}

export function isSupported(id: number): boolean {
  return CHAINS_BY_ID.has(id);
}
