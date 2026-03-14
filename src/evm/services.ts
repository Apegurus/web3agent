import {
  type Abi,
  type AbiFunction,
  type Address,
  type PublicClient,
  createPublicClient,
  formatEther,
  formatUnits,
  isAddress,
  parseEther,
} from "viem";
import { normalize } from "viem/ens";
import { getChainById, isSupported } from "../chains/registry.js";
import { getConfig } from "../config/env.js";
import { getTransportForChain } from "../config/wallet-factory.js";

const clientCache = new Map<number, PublicClient>();
const abiRegistry = new Map<string, Abi>();
const ABI_REGISTRY_MAX = 100;

export function registerAbi(label: string, abi: Abi): void {
  if (abiRegistry.size >= ABI_REGISTRY_MAX && !abiRegistry.has(label)) {
    const oldest = abiRegistry.keys().next().value;
    if (oldest) abiRegistry.delete(oldest);
  }
  abiRegistry.set(label, abi);
}

export function getRegisteredAbi(label: string): Abi | undefined {
  return abiRegistry.get(label);
}

export function listRegisteredAbis(): string[] {
  return [...abiRegistry.keys()];
}

export async function getTokenMetadata(
  publicClient: PublicClient,
  tokenAddress: Address
): Promise<{ symbol: string; decimals: number }> {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "decimals",
    }),
  ]);
  return { symbol, decimals };
}

export function getPublicClientCached(chainId: number): PublicClient {
  const existing = clientCache.get(chainId);
  if (existing) return existing;

  const chain = getChainById(chainId);
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);

  const client = createPublicClient({
    chain,
    transport: getTransportForChain(chainId),
  });

  clientCache.set(chainId, client);
  return client;
}

/**
 * Resolve ENS on mainnet (chain 1) if input contains `.`, otherwise validate as address.
 * ENS always resolves against mainnet regardless of the target chain.
 */
export async function resolveAddressOrEns(input: string, _chainId: number): Promise<Address> {
  if (input.includes(".")) {
    const mainnetClient = getPublicClientCached(1);
    const normalizedName = normalize(input);
    const resolved = await mainnetClient.getEnsAddress({ name: normalizedName });
    if (!resolved) throw new Error(`ENS name "${input}" could not be resolved`);
    return resolved;
  }
  if (!isAddress(input)) {
    throw new Error(`Invalid Ethereum address: "${input}"`);
  }
  return input as Address;
}

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

export async function fetchContractAbi(contractAddress: Address, chainId: number): Promise<Abi> {
  const config = getConfig();
  const apiKey = config.etherscanApiKey;
  if (!apiKey) {
    throw new Error(
      "ETHERSCAN_API_KEY required to fetch contract ABIs. Set the env var or provide abiJson directly."
    );
  }

  const url = `${ETHERSCAN_V2_BASE}?chainid=${chainId}&module=contract&action=getabi&address=${contractAddress}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Etherscan API returned HTTP ${res.status}`);
  }

  const body = (await res.json()) as { status: string; result: string; message: string };
  if (body.status !== "1") {
    throw new Error(`Etherscan ABI fetch failed: ${body.message ?? body.result}`);
  }

  return JSON.parse(body.result) as Abi;
}

export function parseAbiJson(abiString: string): Abi {
  try {
    return JSON.parse(abiString) as Abi;
  } catch (e: unknown) {
    throw new Error(`Invalid ABI JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function findAbiFunction(abi: Abi, functionName: string): AbiFunction {
  const entry = abi.find(
    (item): item is AbiFunction => item.type === "function" && item.name === functionName
  );
  if (!entry) {
    const available = abi
      .filter((item): item is AbiFunction => item.type === "function")
      .map((f) => f.name);
    throw new Error(
      `Function "${functionName}" not found in ABI. Available: ${available.join(", ") || "(none)"}`
    );
  }
  return entry;
}

/**
 * Four-step ABI resolution: user-provided abiJson → registered label → Etherscan v2
 * auto-fetch → common ERC-20/721 signature fallback. Returns the matched function
 * plus source provenance.
 */
export async function resolveAbiFunction(
  contractAddress: Address,
  functionName: string,
  chainId: number,
  abiJson?: string,
  abiLabel?: string
): Promise<{ functionAbi: AbiFunction; fullAbi: Abi; source: string }> {
  if (abiJson) {
    const fullAbi = parseAbiJson(abiJson);
    return { functionAbi: findAbiFunction(fullAbi, functionName), fullAbi, source: "provided" };
  }

  if (abiLabel) {
    const registeredAbi = abiRegistry.get(abiLabel);
    if (!registeredAbi) {
      throw new Error(
        `ABI label "${abiLabel}" not found. Register it first with evm_register_abi. Available: ${[...abiRegistry.keys()].join(", ") || "(none)"}`
      );
    }
    return {
      functionAbi: findAbiFunction(registeredAbi, functionName),
      fullAbi: registeredAbi,
      source: `registry:${abiLabel}`,
    };
  }

  try {
    const fullAbi = await fetchContractAbi(contractAddress, chainId);
    return {
      functionAbi: findAbiFunction(fullAbi, functionName),
      fullAbi,
      source: "etherscan",
    };
  } catch (fetchErr: unknown) {
    const common = COMMON_VIEW_FUNCTIONS[functionName];
    if (common) {
      const functionAbi: AbiFunction = {
        type: "function",
        name: functionName,
        inputs: common.inputs,
        outputs: common.outputs,
        stateMutability: "view",
      };
      return { functionAbi, fullAbi: [functionAbi], source: "common-fallback" };
    }

    throw new Error(
      `Could not resolve ABI for ${functionName}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}. Provide abiJson parameter.`
    );
  }
}

interface CommonFunctionSig {
  inputs: AbiFunction["inputs"];
  outputs: AbiFunction["outputs"];
}

const COMMON_VIEW_FUNCTIONS: Record<string, CommonFunctionSig> = {
  name: { inputs: [], outputs: [{ name: "", type: "string" }] },
  symbol: { inputs: [], outputs: [{ name: "", type: "string" }] },
  decimals: { inputs: [], outputs: [{ name: "", type: "uint8" }] },
  totalSupply: { inputs: [], outputs: [{ name: "", type: "uint256" }] },
  balanceOf: {
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  allowance: {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  ownerOf: {
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  tokenURI: {
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  uri: {
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
};

export const ERC20_BALANCE_ABI = [
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable" as const,
  },
] as const;

export const ERC721_ABI = [
  {
    type: "function" as const,
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
] as const;

export const ERC1155_ABI = [
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "uri",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view" as const,
  },
] as const;

export { formatEther, formatUnits, isAddress, isSupported, parseEther };
