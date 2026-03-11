import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listSupportedChains, serverStatus } from "./utility/index.js";
import {
  transactionConfirm,
  transactionDeny,
  transactionList,
  walletActivate,
  walletDeactivate,
  walletDeriveAddresses,
  walletFromMnemonic,
  walletGenerate,
  walletGenerateMnemonic,
  walletGetActive,
  walletSetConfirmation,
} from "./wallet/index.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export function getWalletToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "wallet_generate",
      description:
        "Generate a new random Ethereum wallet. Returns address and private key once — never stored.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerate(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_generate_mnemonic",
      description: "Generate a new BIP-39 mnemonic phrase with its first derived address.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerateMnemonic(),
      annotations: { readOnlyHint: true },
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
      annotations: { readOnlyHint: true },
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
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_get_active",
      description:
        "Get the currently active wallet address, chain ID, and mode (private-key, mnemonic, or read-only).",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGetActive(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_activate",
      description:
        "Activate a wallet from a private key or mnemonic. Persists to disk (mode 0600) and emits wallet-changed.",
      inputSchema: {
        type: "object",
        properties: {
          privateKey: {
            type: "string",
            description: "Hex-encoded private key (0x-prefixed)",
          },
          mnemonic: {
            type: "string",
            description: "BIP-39 mnemonic phrase",
          },
          accountIndex: {
            type: "number",
            description: "BIP-44 account index (default 0, mnemonic only)",
          },
          addressIndex: {
            type: "number",
            description: "BIP-44 address index (default 0, mnemonic only)",
          },
        },
      },
      handler: (params) => walletActivate(params),
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_deactivate",
      description:
        "Deactivate the current wallet, delete persisted key file, and revert to read-only ephemeral mode.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletDeactivate(),
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_set_confirmation",
      description:
        "Toggle write confirmation at runtime. When enabled, write operations are queued and require explicit confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "true to require confirmation for writes, false to execute immediately",
          },
        },
        required: ["enabled"],
      },
      handler: (params) => walletSetConfirmation(params),
      annotations: { idempotentHint: true },
    },
  ];
}

export function getTransactionToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "transaction_confirm",
      description:
        "Confirm a pending operation by ID. Returns the operation details so the caller can execute it.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "UUID of the pending operation to confirm",
          },
        },
        required: ["id"],
      },
      handler: (params) => transactionConfirm(params),
      annotations: { destructiveHint: true },
    },
    {
      name: "transaction_deny",
      description: "Deny and remove a pending operation by ID without executing it.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "UUID of the pending operation to deny",
          },
        },
        required: ["id"],
      },
      handler: (params) => transactionDeny(params),
      annotations: { idempotentHint: true },
    },
    {
      name: "transaction_list",
      description:
        "List all pending operations awaiting confirmation. Automatically prunes expired entries.",
      inputSchema: { type: "object", properties: {} },
      handler: () => transactionList(),
      annotations: { readOnlyHint: true },
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
      annotations: { readOnlyHint: true },
    },
    {
      name: "list_supported_chains",
      description:
        "List all supported EVM chains with their chain IDs, names, and native currencies.",
      inputSchema: { type: "object", properties: {} },
      handler: () => listSupportedChains(),
      annotations: { readOnlyHint: true },
    },
  ];
}
