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
  integration: z.enum(["orbs", "lifi", "goat"]),
  kind: z.string({ required_error: "kind is required" }),
  state: z.record(z.unknown()),
});

export const prepareOperationSchema = z.union([
  orbsPrepareSwapIntentSchema.extend({
    integration: z.literal("orbs"),
    kind: z.literal("swap"),
  }),
  orbsPrepareTwapIntentSchema.extend({
    integration: z.literal("orbs"),
    kind: z.literal("twap"),
  }),
  orbsPrepareLimitIntentSchema.extend({
    integration: z.literal("orbs"),
    kind: z.literal("limit"),
  }),
  lifiPrepareBridgeIntentSchema.extend({
    integration: z.literal("lifi"),
    kind: z.literal("bridge"),
  }),
  z.object({
    integration: z.literal("goat"),
    kind: z.literal("tool"),
    toolName: z.string({ required_error: "toolName is required" }),
    params: z.record(z.unknown()).optional(),
    chainId: z.number({ required_error: "chainId is required" }),
    account: addressSchema,
  }),
]);

export const resumeOperationSchema = z.object({
  resumeState: operationResumeStateSchema,
  actionResults: operationActionResultsMapSchema.optional(),
});
