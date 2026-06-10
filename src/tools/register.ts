import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { emptyInputSchema } from "../api/schemas/common.js";
import type { RiskLevel } from "../policy/types.js";
import type { ToolCategory } from "../runtime/types.js";
import { listSupportedChains, serverStatus } from "./utility/index.js";
import {
  transactionConfirm,
  transactionDeny,
  transactionList,
  transactionSimulate,
  walletActivate,
  walletDeactivate,
  walletDelete,
  walletDeriveAddresses,
  walletFromMnemonic,
  walletGenerate,
  walletGenerateMnemonic,
  walletGetActive,
  walletInfo,
  walletSetConfirmation,
} from "./wallet/index.js";
import {
  transactionConfirmSchema,
  transactionDenySchema,
  transactionSimulateSchema,
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
  walletInfoSchema,
  walletSetConfirmationSchema,
} from "./wallet/schemas.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: ToolCategory;
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
  /**
   * Static risk level, OR a dynamic classifier that inspects tool args.
   * Dynamic classifiers are used when risk depends on per-invocation data
   * (e.g., CCXT method-specific classification: cancelOrder=destructive,
   * createOrder=financial).
   *
   * For MCP listTools output, a dynamic classifier is reported as "financial"
   * (conservative upper bound) since consumers use the static field as a
   * safety signal.
   */
  riskLevel?: RiskLevel | ((args: Record<string, unknown>) => RiskLevel);
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
        "Generate a new random Ethereum wallet. Returns address and private key once — never stored. Gated: requires WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1. Prefer local CLI: npx web3agent wallet generate.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => walletGenerate(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_generate_mnemonic",
      category: "wallet",
      description:
        "Generate a new BIP-39 mnemonic phrase with its first derived address. Gated: requires WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1. Prefer local CLI: npx web3agent wallet generate --mnemonic.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => walletGenerateMnemonic(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_from_mnemonic",
      category: "wallet",
      description:
        "Derive an address from a BIP-39 mnemonic at optional account/address index. Does NOT return private key. Gated: requires WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1 (mnemonic in agent context). Prefer local CLI.",
      inputSchema: zodToJsonSchema(walletFromMnemonicSchema) as Record<
        string,
        unknown
      >,
      handler: (params) => walletFromMnemonic(params),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_derive_addresses",
      category: "wallet",
      description:
        "Derive multiple addresses from a mnemonic (1-20). Returns index, address, and derivation path. Gated: requires WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1 (mnemonic in agent context). Prefer local CLI.",
      inputSchema: zodToJsonSchema(walletDeriveAddressesSchema) as Record<
        string,
        unknown
      >,
      handler: (params) => walletDeriveAddresses(params),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_get_active",
      category: "wallet",
      description:
        "Get the currently active wallet address, chain ID, and mode (private-key, mnemonic, or read-only).",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => walletGetActive(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_info",
      category: "wallet",
      description:
        "Get wallet backend metadata, storage security posture, and current wallet state without exposing secrets.",
      inputSchema: zodToJsonSchema(walletInfoSchema) as Record<string, unknown>,
      handler: () => walletInfo(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "wallet_activate",
      category: "wallet",
      description:
        "Activate a wallet from a private key or mnemonic using the selected backend (encrypted OWS vault when available, otherwise legacy wallet storage) and emits wallet-changed. Gated when secrets are in input: requires WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1. Prefer local CLI: npx web3agent wallet activate.",
      inputSchema: zodToJsonSchema(walletActivateSchema) as Record<
        string,
        unknown
      >,
      handler: (params) => walletActivate(params),
      riskLevel: "destructive",
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_deactivate",
      category: "wallet",
      description:
        "Deactivate the current runtime/session wallet and revert to read-only ephemeral mode without deleting persisted wallet material.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => walletDeactivate(),
      annotations: { idempotentHint: true },
    },
    {
      name: "wallet_delete",
      category: "wallet",
      description:
        "Permanently delete persisted wallet material through the active backend or legacy storage, then revert to read-only ephemeral mode. Destructive: requires explicit confirmation.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => walletDelete(),
      riskLevel: "destructive",
      annotations: { destructiveHint: true },
    },
    {
      name: "wallet_set_confirmation",
      category: "wallet",
      description:
        "Toggle write confirmation at runtime. When enabled, write operations are queued and require explicit confirmation.",
      inputSchema: zodToJsonSchema(walletSetConfirmationSchema) as Record<
        string,
        unknown
      >,
      handler: (params) => walletSetConfirmation(params),
      riskLevel: "destructive",
      annotations: { idempotentHint: true, destructiveHint: true },
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
      inputSchema: zodToJsonSchema(transactionConfirmSchema) as Record<
        string,
        unknown
      >,
      handler: (params) => transactionConfirm(params),
      annotations: { destructiveHint: true },
    },
    {
      name: "transaction_deny",
      category: "transaction",
      description:
        "Deny and remove a pending operation by ID without executing it.",
      inputSchema: zodToJsonSchema(transactionDenySchema) as Record<
        string,
        unknown
      >,
      handler: (params) => transactionDeny(params),
      annotations: { idempotentHint: true },
    },
    {
      name: "transaction_list",
      category: "transaction",
      description:
        "List all pending operations awaiting confirmation. Automatically prunes expired entries.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => transactionList(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "transaction_simulate",
      category: "transaction",
      description:
        "Simulate an unsigned transaction using RPC trace when available, with fallback static decoding for token balance changes.",
      inputSchema: zodToJsonSchema(transactionSimulateSchema) as Record<
        string,
        unknown
      >,
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
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => serverStatus(),
      annotations: { readOnlyHint: true },
    },
    {
      name: "list_supported_chains",
      category: "status",
      description:
        "List all supported EVM chains with their chain IDs, names, and native currencies.",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: () => listSupportedChains(),
      annotations: { readOnlyHint: true },
    },
  ];
}
