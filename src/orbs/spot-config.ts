/**
 * Spot contract addresses, chain adapters, API URL, and EIP-712 skeleton.
 * Source: Spot repo skill.config.json + repermit.skeleton.json
 */

const SPOT_CONTRACTS = {
  zero: "0x0000000000000000000000000000000000000000" as const,
  repermit: "0x00002a9C4D9497df5Bd31768eC5d30eEf5405000" as const,
  reactor: "0x000000b33fE4fB9d999Dd684F79b110731c3d000" as const,
  executor: "0x000642A0966d9bd49870D9519f76b5cf823f3000" as const,
} as const;

const SPOT_CHAIN_ADAPTERS: Record<number, { name: string; adapter: `0x${string}` }> = {
  1: { name: "Ethereum", adapter: "0xC1bB4d5071Fe7109ae2D67AE05826A3fe9116cfc" },
  56: { name: "BNB Chain", adapter: "0x67Feba015c968c76cCB2EEabf197b4578640BE2C" },
  137: { name: "Polygon", adapter: "0x75A3d70Fa6d054d31C896b9Cf8AB06b1c1B829B8" },
  146: { name: "Sonic", adapter: "0x58fD209C81D84739BaD9c72C082350d67E713EEa" },
  8453: { name: "Base", adapter: "0x5906C4dD71D5afFe1a8f0215409E912eB5d593AD" },
  42161: { name: "Arbitrum One", adapter: "0x026B8977319F67078e932a08feAcB59182B5380f" },
  43114: { name: "Avalanche", adapter: "0x4F48041842827823D3750399eCa2832fC2E29201" },
  59144: { name: "Linea", adapter: "0x55E4da2cd634729064bEb294EC682Dc94f5c3f24" },
};

const SPOT_API_URL = process.env.SPOT_API_URL ?? "https://agents-sink-dev.orbs.network";

export function getSpotContracts(): typeof SPOT_CONTRACTS {
  return SPOT_CONTRACTS;
}

export function isSpotChainSupported(chainId: number): boolean {
  return chainId in SPOT_CHAIN_ADAPTERS;
}

export function getSpotAdapter(chainId: number): `0x${string}` {
  const entry = SPOT_CHAIN_ADAPTERS[chainId];
  if (!entry) {
    const supported = getSupportedSpotChainIds().join(", ");
    throw new Error(`Spot is not available on chain ${chainId}. Supported chains: ${supported}`);
  }
  return entry.adapter;
}

export function getSupportedSpotChainIds(): number[] {
  return Object.keys(SPOT_CHAIN_ADAPTERS)
    .map(Number)
    .sort((a, b) => a - b);
}

export function getSpotApiUrl(): string {
  return SPOT_API_URL;
}

/* ---------- RePermit cancel ABI ---------- */

export const REPERMIT_CANCEL_ABI = [
  {
    type: "function" as const,
    name: "cancel" as const,
    inputs: [{ name: "digests", type: "bytes32[]" } as const],
    outputs: [] as const,
    stateMutability: "nonpayable" as const,
  },
] as const;

type EIP712Field = { name: string; type: string };

export const SPOT_SKELETON = {
  primaryType: "RePermitWitnessTransferFrom" as const,
  types: {
    RePermitWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: "Order" },
    ] as EIP712Field[],
    Exchange: [
      { name: "adapter", type: "address" },
      { name: "ref", type: "address" },
      { name: "share", type: "uint32" },
      { name: "data", type: "bytes" },
    ] as EIP712Field[],
    Input: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "maxAmount", type: "uint256" },
    ] as EIP712Field[],
    Order: [
      { name: "reactor", type: "address" },
      { name: "executor", type: "address" },
      { name: "exchange", type: "Exchange" },
      { name: "swapper", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "start", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "chainid", type: "uint256" },
      { name: "exclusivity", type: "uint32" },
      { name: "epoch", type: "uint32" },
      { name: "slippage", type: "uint32" },
      { name: "freshness", type: "uint32" },
      { name: "input", type: "Input" },
      { name: "output", type: "Output" },
    ] as EIP712Field[],
    Output: [
      { name: "token", type: "address" },
      { name: "limit", type: "uint256" },
      { name: "triggerLower", type: "uint256" },
      { name: "triggerUpper", type: "uint256" },
      { name: "recipient", type: "address" },
    ] as EIP712Field[],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ] as EIP712Field[],
  },
} as const;
