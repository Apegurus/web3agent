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
import { lifiPrepareBridgeIntentSchema, lifiPrepareSameChainSwapSchema } from "./lifi.js";
import { orbsPrepareOrderIntentSchema, orbsPrepareSwapIntentSchema } from "./orbs.js";
import { uniswapV4LifecycleOperationSchema } from "./uniswap-v4/lifecycle.js";
import { zeroExSwapSchema } from "./zerox.js";

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
    permit2: addressSchema.describe("Canonical Permit2 contract address"),
    account: addressSchema.describe("Account address granting the permit"),
    witness: z.literal(true).describe("Whether witness data is included"),
    diamondAddress: addressSchema.describe("LiFi diamond contract address"),
    diamondCalldataHash: hexSchema.describe("Hash of the diamond calldata"),
  }),
]);

export const orbsSwapResumeStateStateSchema = resumeStateBaseSchema.extend({
  integrity: z
    .string()
    .regex(/^v1\.[0-9a-f]{16}\.[0-9a-f]{64}$/)
    .describe("Versioned integrity tag for immutable Orbs swap plan and dispatch fields"),
  chainId: integerChainIdSchema.describe("Chain ID for the swap"),
  quote: z.record(z.unknown()).describe("Orbs Liquidity Hub quote object"),
  approvalActions: z
    .array(preparedTransactionActionSchema)
    .describe("Pending ERC-20 approval actions"),
  signAction: preparedSignTypedDataActionSchema.describe("EIP-712 sign action for the swap"),
});

export const orbsSpotOrderResumeStateStateSchema = resumeStateBaseSchema.extend({
  integrity: z
    .string()
    .regex(/^v1\.[0-9a-f]{16}\.[0-9a-f]{64}$/)
    .describe("Versioned integrity tag for immutable Orbs order plan and dispatch fields"),
  order: z.record(z.unknown()).describe("Spot order typed data object"),
  submitUrl: z.string().describe("API URL for submitting the signed order"),
  approvalActions: z
    .array(preparedTransactionActionSchema)
    .optional()
    .describe("Pending ERC-20 approval actions"),
  signAction: preparedSignTypedDataActionSchema.describe("EIP-712 sign action for the order"),
});

export const goatResumeStateStateSchema = resumeStateBaseSchema
  .extend({
    toolName: z.string().describe("GOAT tool name to execute"),
    params: z.record(z.unknown()).optional().describe("Tool parameters"),
    chainId: integerChainIdSchema.describe("Chain ID for the tool execution"),
    account: addressSchema.describe("Account address executing the tool"),
    preparedActions: z
      .array(preparedActionSchema)
      .optional()
      .describe(
        "Exact canonical GOAT wallet actions, including transaction calldata/value or typed-data payload hashes"
      ),
  })
  .superRefine((value, context) => {
    for (const result of Object.values(value.actionResults ?? {})) {
      if (result.type === "signature" || result.type === "messageSignature") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actionResults"],
          message:
            "GOAT resume state must not persist raw signatures; provide them only with resumeOperation",
        });
      }
    }
  });

export const lifiBridgeResumeStateStateSchema = resumeStateBaseSchema.extend({
  integrity: z
    .string()
    .regex(/^v1\.[0-9a-f]{16}\.[0-9a-f]{64}$/)
    .describe("Versioned integrity tag for immutable LI.FI plan and dispatch fields"),
  operation: lifiPrepareBridgeIntentSchema
    .optional()
    .describe("Original LI.FI bridge input used to rebuild every executable action"),
  stages: z.array(z.array(preparedActionSchema)).describe("Ordered stages of wallet actions"),
  finalAction: preparedTransactionActionSchema.describe("Final bridge transaction action"),
  finalization: lifiBridgeFinalizationSchema
    .optional()
    .describe("Optional Permit2 finalization data"),
});

export const lifiSameChainSwapResumeStateStateSchema = lifiBridgeResumeStateStateSchema.extend({
  chainId: z.literal(4663).describe("Robinhood chain ID for every prepared swap action"),
  operation: lifiPrepareSameChainSwapSchema
    .extend({
      integration: z.literal("lifi").describe("LI.FI integration discriminator"),
      kind: z.literal("swap").describe("Same-chain swap operation discriminator"),
    })
    .describe("Original LI.FI same-chain input bound to the persisted prepared plan"),
});

export const zeroExSwapResumeStateStateSchema = resumeStateBaseSchema.extend({
  integrity: z
    .string()
    .regex(/^v1\.[0-9a-f]{16}\.[0-9a-f]{64}$/)
    .describe("Versioned integrity tag for immutable 0x plan and dispatch fields"),
  presentedStage: z
    .enum(["approval", "final"])
    .describe("Stage whose exact actions were presented to the wallet"),
  operation: zeroExSwapSchema
    .extend({
      chainId: z.literal(4663).describe("Robinhood chain ID for the 0x operation"),
      account: addressSchema.describe("Account executing the 0x operation"),
      integration: z.literal("zeroex").describe("0x integration discriminator"),
      kind: z.literal("swap").describe("Swap operation discriminator"),
    })
    .describe("Canonical 0x operation input used to rebuild each resume plan"),
  approvalActions: z
    .array(preparedTransactionActionSchema)
    .describe("Pending 0x allowance actions"),
  finalAction: preparedTransactionActionSchema.describe("Final 0x swap transaction action"),
});

export const operationResumeStateSchema = z.object({
  version: z.literal(1).describe("Schema version"),
  integration: z
    .enum(["orbs", "lifi", "goat", "uniswap-v4", "zeroex"])
    .describe("Integration name (e.g. 'orbs', 'lifi', 'uniswap-v4')"),
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
  zeroExSwapSchema.extend({
    integration: z.literal("zeroex").describe("Integration name for a Robinhood 0x swap"),
    kind: z.literal("swap").describe("Action type"),
    chainId: z.literal(4663).describe("Robinhood chain ID required for 0x prepared swaps"),
    account: addressSchema.describe("Account address executing the swap"),
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
  uniswapV4LifecycleOperationSchema,
]);

export const resumeOperationSchema = z.object({
  resumeState: operationResumeStateSchema.describe("Opaque resume state from previous call"),
  actionResults: operationActionResultsMapSchema
    .optional()
    .describe("Array of completed action results"),
});
