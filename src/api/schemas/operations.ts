import { z } from "zod";
import {
  addressSchema,
  hexSchema,
  operationActionResultsMapSchema,
  preparedActionSchema,
  preparedSignTypedDataActionSchema,
  preparedTransactionActionSchema,
  resumeStateBaseSchema,
} from "./common.js";
import { lifiPrepareBridgeIntentSchema } from "./lifi.js";
import { orbsPrepareOrderIntentSchema, orbsPrepareSwapIntentSchema } from "./orbs.js";

const integerChainIdSchema = z.custom<number>(
  (value) => typeof value === "number" && Number.isInteger(value),
  {
    message: "resumeState.state.chainId must be an integer",
  }
);

const lifiBridgeFinalizationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("none").describe("No finalization required"),
  }),
  z.object({
    kind: z.literal("permit2").describe("Permit2 finalization type"),
    signatureActionId: z.string().describe("Action ID of the Permit2 signature step"),
    tokenAddress: addressSchema.describe("Token address being permitted"),
    amount: z.string().describe("Permitted token amount"),
    nonce: z.string().describe("Permit2 nonce"),
    deadline: z.string().describe("Permit2 deadline timestamp"),
    permit2Proxy: addressSchema.describe("Permit2 proxy contract address"),
    account: addressSchema.describe("Account address granting the permit"),
    witness: z.literal(true).describe("Whether witness data is included"),
    diamondAddress: addressSchema.describe("LiFi diamond contract address"),
    diamondCalldataHash: hexSchema.describe("Hash of the diamond calldata"),
  }),
]);

export const orbsSwapResumeStateStateSchema = resumeStateBaseSchema.extend({
  chainId: integerChainIdSchema.describe("Chain ID for the swap"),
  quote: z.record(z.unknown()).describe("Orbs Liquidity Hub quote object"),
  approvalActions: z
    .array(preparedTransactionActionSchema)
    .describe("Pending ERC-20 approval actions"),
  signAction: preparedSignTypedDataActionSchema.describe("EIP-712 sign action for the swap"),
});

export const orbsSpotOrderResumeStateStateSchema = resumeStateBaseSchema.extend({
  order: z.record(z.unknown()).describe("Spot order typed data object"),
  submitUrl: z.string().describe("API URL for submitting the signed order"),
  approvalActions: z
    .array(preparedTransactionActionSchema)
    .optional()
    .describe("Pending ERC-20 approval actions"),
  signAction: preparedSignTypedDataActionSchema.describe("EIP-712 sign action for the order"),
});

export const goatResumeStateStateSchema = resumeStateBaseSchema.extend({
  toolName: z.string().describe("GOAT tool name to execute"),
  params: z.record(z.unknown()).optional().describe("Tool parameters"),
  chainId: integerChainIdSchema.describe("Chain ID for the tool execution"),
  account: addressSchema.describe("Account address executing the tool"),
});

export const lifiBridgeResumeStateStateSchema = resumeStateBaseSchema.extend({
  stages: z.array(z.array(preparedActionSchema)).describe("Ordered stages of wallet actions"),
  finalAction: preparedTransactionActionSchema.describe("Final bridge transaction action"),
  finalization: lifiBridgeFinalizationSchema
    .optional()
    .describe("Optional Permit2 finalization data"),
});

export const operationResumeStateSchema = z.object({
  version: z.literal(1).describe("Schema version"),
  integration: z.enum(["orbs", "lifi", "goat"]).describe("Integration name (e.g. 'orbs', 'lifi')"),
  kind: z.string({ required_error: "kind is required" }).describe("Action type"),
  state: z.record(z.unknown()).describe("Opaque resume state from previous call"),
});

export const prepareOperationSchema = z.union([
  orbsPrepareSwapIntentSchema.extend({
    integration: z.literal("orbs").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("swap").describe("Action type"),
  }),
  orbsPrepareOrderIntentSchema.extend({
    integration: z.literal("orbs").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("order").describe("Action type"),
  }),
  lifiPrepareBridgeIntentSchema.extend({
    integration: z.literal("lifi").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("bridge").describe("Action type"),
  }),
  z.object({
    integration: z.literal("goat").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("tool").describe("Action type"),
    toolName: z
      .string({ required_error: "toolName is required" })
      .describe("GOAT tool name to execute"),
    params: z.record(z.unknown()).optional().describe("Action parameters"),
    chainId: z
      .number({ required_error: "chainId is required" })
      .describe("Chain ID for the tool execution"),
    account: addressSchema.describe("Account address executing the tool"),
  }),
]);

export const resumeOperationSchema = z.object({
  resumeState: operationResumeStateSchema.describe("Opaque resume state from previous call"),
  actionResults: operationActionResultsMapSchema
    .optional()
    .describe("Array of completed action results"),
});
