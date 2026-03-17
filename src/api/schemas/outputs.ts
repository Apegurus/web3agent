import { z } from "zod";
import {
  addressSchema,
  hexSchema,
  preparedActionSchema,
  preparedTransactionRequestSchema,
  tokenEstimateSchema,
  typedDataPayloadSchema,
} from "./common.js";

// --- Swap & Quote ---

export const sameChainSwapQuoteResultSchema = z.object({
  kind: z.literal("same-chain").describe("Quote type"),
  provider: z.literal("orbs").describe("Swap provider"),
  chainId: z.number().describe("Chain ID"),
  quote: z.record(z.unknown()).describe("Raw quote object from Orbs SDK"),
});

export const crossChainSwapQuoteSummarySchema = tokenEstimateSchema.extend({
  fromChainId: z.number().describe("Source chain ID"),
  toChainId: z.number().describe("Destination chain ID"),
  fromToken: z.string().optional().describe("Source token address"),
  toToken: z.string().optional().describe("Destination token address"),
  toAmountMin: z.string().optional().describe("Minimum output after slippage"),
  gasCostUSD: z.string().optional().describe("Estimated gas cost in USD"),
  estimatedDurationSeconds: z.number().optional().describe("Estimated time to complete"),
  includedSteps: z
    .array(
      z.object({
        type: z.string().optional().describe("Step type"),
        tool: z.string().optional().describe("Tool/protocol used"),
      })
    )
    .optional()
    .describe("Route steps"),
});

export const crossChainSwapQuoteResultSchema = z.object({
  kind: z.literal("cross-chain").describe("Quote type"),
  provider: z.literal("lifi").describe("Bridge provider"),
  quote: crossChainSwapQuoteSummarySchema.describe("Quote summary"),
});

export const swapQuoteResultSchema = z.discriminatedUnion("kind", [
  sameChainSwapQuoteResultSchema,
  crossChainSwapQuoteResultSchema,
]);

// --- Intents ---

export const approvalStepSchema = z.object({
  type: z.enum(["wrap", "approve"]).describe("Approval type"),
  label: z.string().describe("Human-readable description"),
  tx: z
    .object({
      to: addressSchema.describe("Target contract address"),
      data: hexSchema.optional().describe("Transaction calldata"),
      value: z.string().optional().describe("Native value to send"),
    })
    .describe("Transaction to execute"),
});

export const swapIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  quote: z
    .object({
      sessionId: z.string().describe("Orbs session ID"),
      inToken: z.string().describe("Input token address"),
      outToken: z.string().describe("Output token address"),
      inAmount: z.string().describe("Input amount"),
      outAmount: z.string().describe("Expected output amount"),
      minAmountOut: z.string().describe("Minimum output after slippage"),
      user: z.string().describe("User wallet address"),
    })
    .passthrough()
    .describe("Quote data from Orbs SDK"),
  requiredApprovals: z
    .array(approvalStepSchema)
    .describe("Approval transactions needed before swap"),
  chainId: z.number().describe("Chain ID"),
});

export const twapIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  order: z.record(z.unknown()).describe("TWAP order data"),
  chainId: z.number().describe("Chain ID"),
  meta: z
    .object({
      chunks: z.number().describe("Number of TWAP intervals"),
      fillDelaySeconds: z.number().describe("Delay between fills"),
      durationSeconds: z.number().describe("Total order duration"),
      srcAmountPerChunk: z.string().describe("Amount per chunk in smallest units"),
    })
    .describe("TWAP order metadata"),
});

export const limitIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  order: z.record(z.unknown()).describe("Limit order data"),
  chainId: z.number().describe("Chain ID"),
  meta: z
    .object({
      expirySeconds: z.number().describe("Order expiry duration"),
      toMinAmount: z.string().describe("Minimum output amount"),
    })
    .describe("Limit order metadata"),
});

// --- Bridge ---

export const bridgeTxStepSchema = z.object({
  type: z.enum(["approval", "bridge"]).describe("Step type"),
  label: z.string().describe("Human-readable description"),
  tx: preparedTransactionRequestSchema.describe("Transaction to execute"),
});

export const bridgeIntentEstimateSchema = tokenEstimateSchema.extend({
  toAmountMin: z.string().describe("Minimum output after slippage"),
  gasCostUSD: z.string().optional().describe("Estimated gas cost in USD"),
  estimatedDurationSeconds: z.number().optional().describe("Estimated bridge time"),
});

export const bridgeIntentSchema = z.object({
  steps: z.array(bridgeTxStepSchema).describe("Transaction steps (approvals + bridge)"),
  actions: z.array(preparedActionSchema).describe("Prepared actions for staged execution"),
  estimate: bridgeIntentEstimateSchema.describe("Bridge cost and output estimate"),
  fromChainId: z.number().describe("Source chain ID"),
  toChainId: z.number().describe("Destination chain ID"),
});

// --- Operations ---

export const preparedOperationSchema = z.object({
  integration: z.enum(["orbs", "lifi", "goat"]).describe("Integration provider"),
  kind: z.string().describe("Operation type"),
  summary: z.string().describe("Human-readable summary"),
  actions: z.array(preparedActionSchema).describe("Actions for the caller to execute"),
  resumeState: z
    .object({
      version: z.literal(1),
      integration: z.enum(["orbs", "lifi", "goat"]),
      kind: z.string(),
      state: z.record(z.unknown()),
    })
    .describe("Opaque state to pass to resumeOperation"),
  meta: z.record(z.unknown()).optional().describe("Additional metadata"),
});

// --- Simulation ---

export const balanceChangeSchema = z.object({
  token: addressSchema.describe("Token contract address"),
  symbol: z.string().nullable().describe("Token symbol"),
  decimals: z.number().nullable().describe("Token decimals"),
  amount: z.string().describe("Change amount (signed)"),
  direction: z.enum(["in", "out"]).describe("Direction of balance change"),
});

export const simulationResultSchema = z.object({
  success: z.literal(true).describe("Simulation succeeded"),
  gasEstimate: z.string().describe("Estimated gas usage"),
  balanceChanges: z.array(balanceChangeSchema).describe("Token balance changes"),
});

// --- Spot Order Intent ---

export const spotOrderIntentSchema = z.object({
  typedData: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  approval: z
    .object({
      token: z.string().describe("Token to approve"),
      spender: z.string().describe("RePermit contract address"),
      amount: z.string().describe("Approval amount"),
      exactApproval: z.boolean().describe("Whether approval is for exact amount or unlimited"),
      tx: z
        .object({
          to: z.string().describe("Token contract address"),
          data: hexSchema.describe("Approval calldata"),
          value: z.string().describe("Native value (always 0x0)"),
        })
        .describe("Approval transaction"),
    })
    .describe("Token approval for RePermit"),
  submit: z
    .object({
      url: z.string().describe("URL to POST the signed order"),
      body: z
        .object({
          order: z.record(z.unknown()).describe("Order witness to submit"),
          signature: z.null().describe("Placeholder for signature after signing"),
          status: z.literal("pending").describe("Order status"),
        })
        .describe("Submit request body template"),
    })
    .describe("Submit endpoint and payload template"),
  query: z
    .object({
      url: z.string().describe("Base URL for querying order status"),
    })
    .describe("Query endpoint"),
  meta: z
    .object({
      kind: z.enum(["single", "chunked"]).describe("Order kind"),
      chunkCount: z.number().describe("Number of chunks"),
      chunkInputAmount: z.string().describe("Input amount per chunk"),
      start: z.number().describe("Start timestamp"),
      deadline: z.number().describe("Deadline timestamp"),
      epoch: z.number().describe("Epoch seconds between chunks"),
      limit: z.string().describe("Output limit per chunk"),
    })
    .describe("Order metadata"),
  warnings: z.array(z.string()).describe("Validation warnings"),
  chainId: z.number().describe("Chain ID"),
});

// --- Swap Status & History ---

export const swapSubmissionResultSchema = z.object({
  sessionId: z.string().describe("Swap session ID"),
  txHash: z.string().optional().describe("Transaction hash if available"),
  status: z.enum(["submitted", "completed", "failed"]).describe("Swap status"),
  error: z.string().optional().describe("Error message if failed"),
});

export const tokenSwappableResultSchema = z.object({
  swappable: z.boolean().describe("Whether the token pair is swappable"),
  provider: z.enum(["orbs", "lifi"]).describe("Available swap provider"),
  kind: z.enum(["same-chain", "cross-chain"]).describe("Swap type"),
  reason: z.string().optional().describe("Reason if not swappable"),
});
