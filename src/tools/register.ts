import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listSupportedChains, serverStatus } from "./utility/index.js";
import {
  walletDeriveAddresses,
  walletFromMnemonic,
  walletGenerate,
  walletGenerateMnemonic,
  walletGetActive,
} from "./wallet/index.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
}

export function getWalletToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "wallet_generate",
      description:
        "Generate a new random Ethereum wallet. Returns address and private key once — never stored.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerate(),
    },
    {
      name: "wallet_generate_mnemonic",
      description: "Generate a new BIP-39 mnemonic phrase with its first derived address.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerateMnemonic(),
    },
    {
      name: "wallet_from_mnemonic",
      description:
        "Derive an address from a BIP-39 mnemonic at optional account/address index. Does NOT return private key.",
      inputSchema: {
        type: "object",
        properties: {
          mnemonic: { type: "string", description: "BIP-39 mnemonic phrase" },
          accountIndex: {
            type: "number",
            description: "BIP-44 account index (default 0)",
          },
          addressIndex: {
            type: "number",
            description: "BIP-44 address index (default 0)",
          },
        },
        required: ["mnemonic"],
      },
      handler: (params) => walletFromMnemonic(params),
    },
    {
      name: "wallet_derive_addresses",
      description:
        "Derive multiple addresses from a mnemonic (1-20). Returns index, address, and derivation path.",
      inputSchema: {
        type: "object",
        properties: {
          mnemonic: { type: "string", description: "BIP-39 mnemonic phrase" },
          count: {
            type: "number",
            description: "Number of addresses to derive (1-20, default 5)",
          },
        },
        required: ["mnemonic"],
      },
      handler: (params) => walletDeriveAddresses(params),
    },
    {
      name: "wallet_get_active",
      description:
        "Get the currently active wallet address, chain ID, and mode (private-key, mnemonic, or read-only).",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGetActive(),
    },
  ];
}

export function getUtilityToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "server_status",
      description:
        "Get current server status including wallet mode, active chain, confirmation setting, and backend health.",
      inputSchema: { type: "object", properties: {} },
      handler: () => serverStatus(),
    },
    {
      name: "list_supported_chains",
      description:
        "List all supported EVM chains with their chain IDs, names, and native currencies.",
      inputSchema: { type: "object", properties: {} },
      handler: () => listSupportedChains(),
    },
  ];
}
