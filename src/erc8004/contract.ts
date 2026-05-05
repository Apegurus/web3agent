import type { Hex } from "viem";

// ERC-8004 Identity Registry ABI
export const identityRegistryAbi = [
  // register(string agentURI) returns (uint256 agentId)
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  // setAgentURI(uint256 agentId, string newURI)
  {
    name: "setAgentURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  // addressToTokenId(address) view returns (uint256)
  {
    name: "addressToTokenId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  // getAgent(uint256 agentId) view returns (address owner, string agentURI)
  {
    name: "getAgent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "agentURI", type: "string" },
    ],
  },
  // tokenURI(uint256) view returns (string)
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  // Registered event
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
    ],
  },
] as const;

// ERC-8004 Reputation Registry ABI
export const reputationRegistryAbi = [
  // giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  // getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 value, uint8 decimals)
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clients", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "value", type: "int128" },
      { name: "decimals", type: "uint8" },
    ],
  },
  // getClients(uint256 agentId) view returns (address[])
  {
    name: "getClients",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  // readAllFeedback(uint256 agentId, address[] clients, string tag1, string tag2, bool includeRevoked)
  {
    name: "readAllFeedback",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clients", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "includeRevoked", type: "bool" },
    ],
    outputs: [
      {
        name: "feedbacks",
        type: "tuple[]",
        components: [
          { name: "client", type: "address" },
          { name: "value", type: "int128" },
          { name: "valueDecimals", type: "uint8" },
          { name: "tag1", type: "string" },
          { name: "tag2", type: "string" },
          { name: "endpoint", type: "string" },
          { name: "feedbackURI", type: "string" },
          { name: "feedbackHash", type: "bytes32" },
          { name: "revoked", type: "bool" },
        ],
      },
    ],
  },
  // NewFeedback event
  {
    name: "NewFeedback",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
    ],
  },
] as const;

// Canonical ERC-8004 contract addresses
export const ERC8004_ADDRESSES = {
  identity: {
    8453: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Hex, // Base
    84532: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Hex, // Base Sepolia
    1: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Hex, // Ethereum (same as Base mainnet)
    11155111: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Hex, // Sepolia (same as Base Sepolia)
  } as Record<number, Hex>,
  reputation: {
    8453: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Hex, // Base
    84532: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Hex, // Base Sepolia
    1: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Hex, // Ethereum
    11155111: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Hex, // Sepolia
  } as Record<number, Hex>,
};

export function getIdentityAddress(chainId: number): Hex | null {
  return ERC8004_ADDRESSES.identity[chainId] ?? null;
}

export function getReputationAddress(chainId: number): Hex | null {
  return ERC8004_ADDRESSES.reputation[chainId] ?? null;
}
