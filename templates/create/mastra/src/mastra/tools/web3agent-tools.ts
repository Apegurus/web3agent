import { createTool } from "@mastra/core/tools";
import { prepareOperation, resolveToken, resumeOperation, simulateTransaction } from "web3agent";
import { z } from "zod";

function normalizeToolInput<T>(input: T | { context: T }): T {
  if (typeof input === "object" && input !== null && "context" in input) {
    return (input as { context: T }).context;
  }
  return input as T;
}

const prepareBridgeInputSchema = z.object({
  fromChainId: z.number().describe("Source chain ID for the bridge operation."),
  toChainId: z.number().describe("Destination chain ID for the bridge operation."),
  fromToken: z.string().describe("Source token address or native token alias."),
  toToken: z.string().describe("Destination token address or native token alias."),
  fromAmount: z.string().describe("Raw amount to bridge, in token base units."),
  account: z.string().describe("Wallet address that will execute the operation."),
});

const simulatePreparedTransactionSchema = z.object({
  chainId: z.number().describe("Chain ID for the simulation."),
  from: z.string().describe("Sender address."),
  to: z.string().describe("Target contract or recipient address."),
  data: z.string().optional().describe("Optional calldata for the transaction."),
  value: z.string().optional().describe("Optional native value in wei."),
});

const resumePreparedOperationSchema = z.object({
  resumeState: z.record(z.unknown()).describe("Opaque resume state returned by prepareOperation."),
  actionResults: z
    .record(z.unknown())
    .describe("Completed wallet action results keyed by action ID."),
});

export const resolveTokenTool = createTool({
  id: "resolve-token",
  description: "Resolve a token symbol into a chain-specific token address via web3agent.",
  inputSchema: z.object({
    symbol: z.string().describe("Ticker or canonical symbol to resolve."),
    chainId: z.number().describe("Chain ID where the token should be resolved."),
  }),
  execute: async (input) => {
    const params = normalizeToolInput(input);
    return resolveToken(params);
  },
});

export const prepareBridgeOperationTool = createTool({
  id: "prepare-bridge-operation",
  description:
    "Prepare a LI.FI bridge operation using web3agent. Use this before any wallet execution.",
  inputSchema: prepareBridgeInputSchema,
  execute: async (input) => {
    const params = normalizeToolInput(input);
    return prepareOperation({
      integration: "lifi",
      kind: "bridge",
      ...params,
    });
  },
});

export const simulatePreparedTransactionTool = createTool({
  id: "simulate-prepared-transaction",
  description: "Simulate a prepared transaction action before user confirmation or execution.",
  inputSchema: simulatePreparedTransactionSchema,
  execute: async (input) => {
    const params = normalizeToolInput(input);
    return simulateTransaction(params);
  },
});

export const resumePreparedOperationTool = createTool({
  id: "resume-prepared-operation",
  description:
    "Resume a previously prepared operation using exact wallet action results returned by the caller.",
  inputSchema: resumePreparedOperationSchema,
  execute: async (input) => {
    const params = normalizeToolInput(input);
    return resumeOperation({
      resumeState: params.resumeState as never,
      actionResults: params.actionResults as never,
    });
  },
});
