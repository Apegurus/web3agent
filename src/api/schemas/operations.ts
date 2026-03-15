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
import {
  orbsPrepareLimitIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
} from "./orbs.js";

const integerChainIdSchema = z.custom<number>(
  (value) => typeof value === "number" && Number.isInteger(value),
  {
    message: "resumeState.state.chainId must be an integer",
  }
);

const lifiBridgeFinalizationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("none"),
  }),
  z.object({
    kind: z.literal("permit2"),
    signatureActionId: z.string(),
    tokenAddress: addressSchema,
    amount: z.string(),
    nonce: z.string(),
    deadline: z.string(),
    permit2Proxy: addressSchema,
    account: addressSchema,
    witness: z.literal(true),
    diamondAddress: addressSchema,
    diamondCalldataHash: hexSchema,
  }),
]);

export const orbsSwapResumeStateStateSchema = resumeStateBaseSchema.extend({
  chainId: integerChainIdSchema,
  quote: z.record(z.unknown()),
  approvalActions: z.array(preparedTransactionActionSchema),
  signAction: preparedSignTypedDataActionSchema,
});

export const orbsOrderResumeStateStateSchema = resumeStateBaseSchema.extend({
  order: z.record(z.unknown()),
  signAction: preparedSignTypedDataActionSchema,
});

export const goatResumeStateStateSchema = resumeStateBaseSchema.extend({
  toolName: z.string(),
  params: z.record(z.unknown()).optional(),
  chainId: integerChainIdSchema,
  account: addressSchema,
});

export const lifiBridgeResumeStateStateSchema = resumeStateBaseSchema.extend({
  stages: z.array(z.array(preparedActionSchema)),
  finalAction: preparedTransactionActionSchema,
  finalization: lifiBridgeFinalizationSchema.optional(),
});

export const operationResumeStateSchema = z.object({
  version: z.literal(1),
  integration: z.enum(["orbs", "lifi", "goat"]).describe("Integration name (e.g. 'orbs', 'lifi')"),
  kind: z.string({ required_error: "kind is required" }).describe("Action type"),
  state: z.record(z.unknown()).describe("Opaque resume state from previous call"),
});

export const prepareOperationSchema = z.union([
  orbsPrepareSwapIntentSchema.extend({
    integration: z.literal("orbs").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("swap").describe("Action type"),
  }),
  orbsPrepareTwapIntentSchema.extend({
    integration: z.literal("orbs").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("twap").describe("Action type"),
  }),
  orbsPrepareLimitIntentSchema.extend({
    integration: z.literal("orbs").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("limit").describe("Action type"),
  }),
  lifiPrepareBridgeIntentSchema.extend({
    integration: z.literal("lifi").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("bridge").describe("Action type"),
  }),
  z.object({
    integration: z.literal("goat").describe("Integration name (e.g. 'orbs', 'lifi')"),
    kind: z.literal("tool").describe("Action type"),
    toolName: z.string({ required_error: "toolName is required" }),
    params: z.record(z.unknown()).optional().describe("Action parameters"),
    chainId: z.number({ required_error: "chainId is required" }),
    account: addressSchema,
  }),
]);

export const resumeOperationSchema = z.object({
  resumeState: operationResumeStateSchema.describe("Opaque resume state from previous call"),
  actionResults: operationActionResultsMapSchema
    .optional()
    .describe("Array of completed action results"),
});
