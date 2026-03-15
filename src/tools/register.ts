import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolCategory } from "../runtime/types.js";
import { listSupportedChains, serverStatus } from "./utility/index.js";
import {
  transactionConfirm,
  transactionDeny,
  transactionList,
  transactionSimulate,
  walletActivate,
  walletDeactivate,
  walletDeriveAddresses,
  walletFromMnemonic,
  walletGenerate,
  walletGenerateMnemonic,
  walletGetActive,
  walletSetConfirmation,
} from "./wallet/index.js";
import {
  transactionConfirmSchema,
  transactionDenySchema,
  transactionSimulateSchema,
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
  walletSetConfirmationSchema,
} from "./wallet/schemas.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: ToolCategory;
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
      category: "wallet",
      description:
        "Generate a new random Ethereum wallet. Returns address and private key once — never stored.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerate(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_generate_mnemonic",
      category: "wallet",
      description: "Generate a new BIP-39 mnemonic phrase with its first derived address.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGenerateMnemonic(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_from_mnemonic",
      category: "wallet",
      description:
        "Derive an address from a BIP-39 mnemonic at optional account/address index. Does NOT return private key.",
      inputSchema: zodToJsonSchema(walletFromMnemonicSchema) as Record<string, unknown>,
      handler: (params) => walletFromMnemonic(params),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_derive_addresses",
      category: "wallet",
      description:
        "Derive multiple addresses from a mnemonic (1-20). Returns index, address, and derivation path.",
      inputSchema: zodToJsonSchema(walletDeriveAddressesSchema) as Record<string, unknown>,
      handler: (params) => walletDeriveAddresses(params),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_get_active",
      category: "wallet",
      description:
        "Get the currently active wallet address, chain ID, and mode (private-key, mnemonic, or read-only).",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletGetActive(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_activate",
      category: "wallet",
      description:
        "Activate a wallet from a private key or mnemonic. Persists to disk (mode 0600) and emits wallet-changed.",
      inputSchema: zodToJsonSchema(walletActivateSchema) as Record<string, unknown>,
      handler: (params) => walletActivate(params),
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_deactivate",
      category: "wallet",
      description:
        "Deactivate the current wallet, delete persisted key file, and revert to read-only ephemeral mode.",
      inputSchema: { type: "object", properties: {} },
      handler: () => walletDeactivate(),
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_set_confirmation",
      category: "wallet",
      description:
        "Toggle write confirmation at runtime. When enabled, write operations are queued and require explicit confirmation.",
      inputSchema: zodToJsonSchema(walletSetConfirmationSchema) as Record<string, unknown>,
      handler: (params) => walletSetConfirmation(params),
      annotations: { idempotentHint: true },
    },
  ];
}

export function getTransactionToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "transaction_confirm",
      category: "transaction",
      description:
        "Confirm a pending operation by ID. Returns the operation details so the caller can execute it.",
      inputSchema: zodToJsonSchema(transactionConfirmSchema) as Record<string, unknown>,
      handler: (params) => transactionConfirm(params),
      annotations: { destructiveHint: true },
    },
    {
      name: "transaction_deny",
      category: "transaction",
      description: "Deny and remove a pending operation by ID without executing it.",
      inputSchema: zodToJsonSchema(transactionDenySchema) as Record<string, unknown>,
      handler: (params) => transactionDeny(params),
      annotations: { idempotentHint: true },
    },
    {
      name: "transaction_list",
      category: "transaction",
      description:
        "List all pending operations awaiting confirmation. Automatically prunes expired entries.",
      inputSchema: { type: "object", properties: {} },
      handler: () => transactionList(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "transaction_simulate",
      category: "transaction",
      description:
        "Simulate an unsigned transaction using RPC trace when available, with fallback static decoding for token balance changes.",
      inputSchema: zodToJsonSchema(transactionSimulateSchema) as Record<string, unknown>,
      handler: (params) => transactionSimulate(params),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function getUtilityToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "server_status",
      category: "status",
      description:
        "Get current server status including wallet mode, active chain, confirmation setting, and backend health.",
      inputSchema: { type: "object", properties: {} },
      handler: () => serverStatus(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "list_supported_chains",
      category: "status",
      description:
        "List all supported EVM chains with their chain IDs, names, and native currencies.",
      inputSchema: { type: "object", properties: {} },
      handler: () => listSupportedChains(),
      annotations: { readOnlyHint: true },
    },
  ];
}
