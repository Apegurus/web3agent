import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  radardexChainSchema,
  radardexQuoteOutputSchema,
  radardexQuoteSchema,
  radardexRouteHealthOutputSchema,
  radardexSwapOutputSchema,
  radardexSwapSchema,
  radardexTokenListOutputSchema,
} from "../../api/schemas/radardex.js";
import type { RadarDexChainInput } from "../../api/schemas/radardex.js";
import type {
  RadarExecutionResult,
  RadarQuoteResult,
  RadarRoute,
} from "../../providers/radardex/index.js";
import { RADARDEX_ARC } from "../../providers/radardex/manifest.js";
import { formatToolErrorFromUnknown, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { defaultRadarDexToolDependencies } from "./runtime-dependencies.js";
import type { RadarDexToolDependencies } from "./types.js";

function serializeExecution(execution: RadarRoute["execution"]): unknown {
  return execution.kind === "v4_native"
    ? { ...execution, nativeValue: execution.nativeValue.toString() }
    : execution;
}

function serializeRoute(route: RadarRoute): unknown {
  return radardexQuoteOutputSchema.shape.routes.element.parse({
    ...route,
    grossInput: route.grossInput.toString(),
    netInput: route.netInput.toString(),
    expectedOutput: route.expectedOutput.toString(),
    ...(route.gasEstimate === undefined ? {} : { gasEstimate: route.gasEstimate.toString() }),
    execution: serializeExecution(route.execution),
  });
}

function serializeQuote(result: RadarQuoteResult): unknown {
  return radardexQuoteOutputSchema.parse({
    request: result.request,
    routes: result.routes.map(serializeRoute),
    ...(result.best ? { best: serializeRoute(result.best) } : {}),
    health: result.health,
  });
}

function serializeSwap(result: RadarExecutionResult): unknown {
  return radardexSwapOutputSchema.parse({
    txHash: result.txHash,
    minimumOutput: result.minimumOutput.toString(),
    route: serializeRoute(result.route),
  });
}

export async function executeRadarDexSwapNow(
  params: Record<string, unknown>,
  dependencies: RadarDexToolDependencies = defaultRadarDexToolDependencies
): Promise<CallToolResult> {
  const validation = validateInput(radardexSwapSchema, params);
  if (!validation.success) return validation.error;
  try {
    const input = radardexSwapSchema.parse(validation.data);
    return formatToolResponse(serializeSwap(await dependencies.executeSwap(input)));
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("RADARDEX_SWAP_ERROR", error);
  }
}

export function getRadarDexToolDefinitions(
  dependencies: RadarDexToolDependencies = defaultRadarDexToolDependencies
): ToolDefinition[] {
  const listTokens = createToolHandler<RadarDexChainInput>(
    radardexChainSchema,
    async () =>
      radardexTokenListOutputSchema.parse({
        chainId: RADARDEX_ARC.chainId,
        tokens: await dependencies.listTokens(),
      }),
    "RADARDEX_TOKEN_ERROR"
  );
  const getQuote = createToolHandler(
    radardexQuoteSchema,
    async (input) => serializeQuote(await dependencies.getQuote(radardexQuoteSchema.parse(input))),
    "RADARDEX_QUOTE_ERROR"
  );
  const getRouteHealth = createToolHandler<RadarDexChainInput>(
    radardexChainSchema,
    async () =>
      radardexRouteHealthOutputSchema.parse({
        chainId: RADARDEX_ARC.chainId,
        venues: await dependencies.getRouteHealth(),
      }),
    "RADARDEX_HEALTH_ERROR"
  );
  const swap = async (params: Record<string, unknown>): Promise<CallToolResult> => {
    const validation = validateInput(radardexSwapSchema, params);
    if (!validation.success) return validation.error;
    return executeWrite({
      toolName: "radardex_swap",
      description: `RadarDEX swap: ${validation.data.fromAmount} of ${validation.data.fromToken} → ${validation.data.toToken} on Arc`,
      params: { ...validation.data },
      executor: (queuedParams) => executeRadarDexSwapNow(queuedParams, dependencies),
      riskLevel: "financial",
    });
  };

  return [
    {
      name: "radardex_list_tokens",
      category: "tokens",
      description: "List RadarDEX tokens available on Arc mainnet (chain 5042).",
      inputSchema: zodToJsonSchema(radardexChainSchema) as Record<string, unknown>,
      handler: listTokens,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "radardex_get_quote",
      category: "swap",
      description:
        "Quote verified RadarDEX routes on Arc mainnet. Amounts are returned as decimal strings.",
      inputSchema: zodToJsonSchema(radardexQuoteSchema) as Record<string, unknown>,
      handler: getQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "radardex_get_route_health",
      category: "status",
      description: "Check RadarDEX route contract and live fee health on Arc mainnet.",
      inputSchema: zodToJsonSchema(radardexChainSchema) as Record<string, unknown>,
      handler: getRouteHealth,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "radardex_swap",
      category: "swap",
      description: "Execute a RadarDEX swap on Arc mainnet through the confirmation queue.",
      inputSchema: zodToJsonSchema(radardexSwapSchema) as Record<string, unknown>,
      handler: swap,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerRadarDexExecutors(): void {
  registerExecutor("radardex_swap", executeRadarDexSwapNow);
}

export type { RadarDexToolDependencies } from "./types.js";
