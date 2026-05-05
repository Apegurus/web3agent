import { zodToJsonSchema } from "zod-to-json-schema";

import type { ToolDefinition } from "../../tools/register.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import {
  orbsGetRequiredApprovalsTool,
  orbsPrepareLimitIntent,
  orbsPrepareOrderIntent,
  orbsPrepareSwapIntentTool,
  orbsPrepareTwapIntent,
  orbsSubmitSignedSwapTool,
} from "./intents.js";
import {
  executeSpotCancelNow,
  executeSpotOrderNow,
  orbsCancelOrder,
  orbsPlaceLimit,
  orbsPlaceOrder,
  orbsPlaceTwap,
  orbsQueryOrders,
  orbsSubmitSignedOrderHandler,
} from "./orders.js";
import { orbsGetQuote } from "./quotes.js";
import {
  orbsCancelOrderSchema,
  orbsGetQuoteSchema,
  orbsGetRequiredApprovalsSchema,
  orbsPlaceLimitSchema,
  orbsPlaceOrderSchema,
  orbsPlaceTwapSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareOrderIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
  orbsSubmitSignedSwapSchema,
  orbsSwapSchema,
  orbsSwapStatusSchema,
} from "./schemas.js";
import { executeOrbsSwapNow, orbsSwap, orbsSwapStatus } from "./swaps.js";

export function getOrbsToolDefinitions(): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "orbs_get_quote",
      category: "swap",
      description:
        "Get a quote from Orbs Liquidity Hub for same-chain aggregated swap. " +
        "Requires token addresses — use resolve_token first to get addresses.",
      inputSchema: zodToJsonSchema(orbsGetQuoteSchema) as Record<string, unknown>,
      handler: orbsGetQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_swap",
      category: "swap",
      description:
        "Execute a same-chain swap via Orbs Liquidity Hub (write, confirmation-gated). " +
        "Supported chains: 137 (Polygon), 56 (BSC), 8453 (Base), 59144 (Linea), 81457 (Blast), 42161 (Arbitrum). " +
        "Requires token addresses — use resolve_token first.",
      inputSchema: zodToJsonSchema(orbsSwapSchema) as Record<string, unknown>,
      handler: orbsSwap,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_swap_intent",
      category: "swap",
      description:
        "Prepare a same-chain Orbs swap intent for external wallet signing. Returns required approvals, full quote, and EIP-712 typed data.",
      inputSchema: zodToJsonSchema(orbsPrepareSwapIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareSwapIntentTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_get_required_approvals",
      category: "swap",
      description:
        "Check whether wrapping native assets or approving Permit2 is required before signing an Orbs swap intent.",
      inputSchema: zodToJsonSchema(orbsGetRequiredApprovalsSchema) as Record<string, unknown>,
      handler: orbsGetRequiredApprovalsTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_submit_signed_swap",
      category: "swap",
      description:
        "Submit an externally signed Orbs Liquidity Hub swap using the quote returned by orbs_prepare_swap_intent.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedSwapSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedSwapTool,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_swap_status",
      category: "swap",
      description: "Check the status of a pending Orbs Liquidity Hub swap",
      inputSchema: zodToJsonSchema(orbsSwapStatusSchema) as Record<string, unknown>,
      handler: orbsSwapStatus,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_twap",
      category: "orders",
      description:
        "Place a TWAP (time-weighted average price) order via Spot protocol. " +
        "Splits fromAmount into equal chunks executed at regular intervals. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceTwapSchema) as Record<string, unknown>,
      handler: orbsPlaceTwap,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_twap_intent",
      category: "orders",
      description:
        "Prepare a TWAP order for external wallet signing. Returns EIP-712 typed data, approval calldata, and metadata.",
      inputSchema: zodToJsonSchema(orbsPrepareTwapIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareTwapIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_limit",
      category: "orders",
      description:
        "Place a limit order via Spot protocol. Executes only when output meets minimum amount. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceLimitSchema) as Record<string, unknown>,
      handler: orbsPlaceLimit,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_limit_intent",
      category: "orders",
      description:
        "Prepare a limit order for external wallet signing. Returns EIP-712 typed data, approval calldata, and metadata.",
      inputSchema: zodToJsonSchema(orbsPrepareLimitIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareLimitIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_order",
      category: "orders",
      description:
        "Place a gasless order via Spot protocol. Supports market, limit, TWAP, stop-loss, take-profit, " +
        "and delayed orders. Order type determined by parameters: limit (outputLimit > 0), " +
        "chunked/TWAP (fromMaxAmount > fromAmount + epoch), stop-loss (outputTriggerLower), " +
        "take-profit (outputTriggerUpper), delayed (future start). Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceOrderSchema) as Record<string, unknown>,
      handler: orbsPlaceOrder,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_order_intent",
      category: "orders",
      description:
        "Prepare a Spot order for external wallet signing. Returns EIP-712 typed data, " +
        "approval calldata, submit URL, and order metadata. Supports all order types.",
      inputSchema: zodToJsonSchema(orbsPrepareOrderIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareOrderIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_submit_signed_order",
      category: "orders",
      description:
        "Submit an externally signed Spot order using the submit URL and order from orbs_prepare_order_intent.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedOrderSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedOrderHandler,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_query_orders",
      category: "orders",
      description:
        "Query Spot orders by swapper address or order hash. Falls back to SDK query if Spot API unavailable.",
      inputSchema: zodToJsonSchema(orbsQueryOrdersSchema) as Record<string, unknown>,
      handler: orbsQueryOrders,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_cancel_order",
      category: "orders",
      description:
        "Cancel a Spot order onchain by calling RePermit.cancel with the order digest. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsCancelOrderSchema) as Record<string, unknown>,
      handler: orbsCancelOrder,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];

  return tools;
}

export function registerOrbsExecutors(): void {
  registerExecutor("orbs_swap", executeOrbsSwapNow);
  registerExecutor("orbs_place_order", executeSpotOrderNow);
  registerExecutor("orbs_place_twap", executeSpotOrderNow);
  registerExecutor("orbs_place_limit", executeSpotOrderNow);
  registerExecutor("orbs_cancel_order", executeSpotCancelNow);
}
