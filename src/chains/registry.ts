import type { Chain } from "viem";
import {
	mainnet,
	base,
	arbitrum,
	optimism,
	polygon,
	linea,
	bsc,
	avalanche,
	zksync,
	scroll,
	mode,
	blast,
	mantle,
	celo,
	gnosis,
	sepolia,
	baseSepolia,
} from "viem/chains";

const CHAINS_BY_ID: ReadonlyMap<number, Chain> = new Map<number, Chain>([
	[1, mainnet],
	[8453, base],
	[42161, arbitrum],
	[10, optimism],
	[137, polygon],
	[59144, linea],
	[56, bsc],
	[43114, avalanche],
	[324, zksync],
	[534352, scroll],
	[34443, mode],
	[81457, blast],
	[5000, mantle],
	[42220, celo],
	[100, gnosis],
	[11155111, sepolia],
	[84532, baseSepolia],
]);

const CHAINS_BY_NAME: ReadonlyMap<string, Chain> = new Map<string, Chain>(
	[...CHAINS_BY_ID.values()].map((chain) => [chain.name.toLowerCase(), chain]),
);

export const SUPPORTED_CHAIN_IDS: number[] = [...CHAINS_BY_ID.keys()];

export function getChainById(id: number): Chain | undefined {
	return CHAINS_BY_ID.get(id);
}

export function getChainByName(name: string): Chain | undefined {
	return CHAINS_BY_NAME.get(name.toLowerCase());
}

export function getAllChains(): Chain[] {
	return [...CHAINS_BY_ID.values()];
}

export function isSupported(id: number): boolean {
	return CHAINS_BY_ID.has(id);
}
