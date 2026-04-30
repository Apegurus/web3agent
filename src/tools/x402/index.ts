import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getConfig } from "../../config/env.js";
import { resolvePolicy } from "../../policy/config.js";
import type { ToolCategory } from "../../runtime/types.js";
import { estimateTokenUsd } from "../../tokens/pricing.js";
import { lookupTokenByAddress } from "../../tokens/registry.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import { createX402Client, probePaymentRequirements } from "../../x402/client.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  x402CheckRequirementsSchema,
  x402FetchExecutorSchema,
  x402FetchSchema,
} from "./schemas.js";

function toExecutorParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

const x402CheckRequirements = createToolHandler(
  x402CheckRequirementsSchema,
  async (input: { url: string; method?: string; headers?: Record<string, string> }) => {
    const { requirements } = await probePaymentRequirements(input.url, input.method, input.headers);
    if (!requirements) {
      return { paymentRequired: false, message: "No payment required for this URL" };
    }
    return { paymentRequired: true, requirements };
  },
  "X402_ERROR"
);

async function x402Fetch(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(x402FetchSchema, params);
  if (!v.success) return v.error;
  const { url, method, headers } = v.data;

  let paymentDescription: string;
  let paymentChainId: number | null = null;
  try {
    const { requirements, probeResponse } = await probePaymentRequirements(
      url,
      method,
      headers,
      v.data.body
    );
    if (!requirements) {
      const responseText = await probeResponse.text();
      return formatToolResponse({
        status: probeResponse.status,
        ok: probeResponse.ok,
        body: responseText,
        paymentMade: false,
      });
    }
    const firstAccept = requirements.accepts?.[0];
    const amount = firstAccept?.amount ?? "unknown";
    const network = firstAccept?.network ?? "unknown network";
    paymentDescription = `Pay ${amount} on ${network} to access ${url}`;

    // Estimate USD value from x402 payment requirements.
    // amount is in the payment token's smallest units (e.g., 1000000 = 1 USDC).
    // asset is the token contract address, network is CAIP-2 format "eip155:{chainId}".
    const asset = firstAccept?.asset;
    const networkStr = firstAccept?.network;
    const rawChainId = typeof networkStr === "string" ? Number(networkStr.split(":")[1]) : null;
    paymentChainId =
      typeof rawChainId === "number" && Number.isFinite(rawChainId) ? rawChainId : null;

    if (typeof amount === "string" && typeof asset === "string" && paymentChainId) {
      const entry = lookupTokenByAddress(asset, paymentChainId);
      const decimals = entry?.decimals ?? 18;
      const quotedUsd = await estimateTokenUsd(asset, paymentChainId, amount, decimals);

      if (quotedUsd !== null && quotedUsd > 0) {
        const policy = resolvePolicy(getConfig());
        if (policy.enabled && quotedUsd > policy.maxX402PaymentUsd) {
          return formatToolError(
            "POLICY_DENIED",
            `x402 quoted payment $${quotedUsd.toFixed(2)} exceeds x402 limit of $${policy.maxX402PaymentUsd.toFixed(2)}`
          );
        }
      }
    }
  } catch (e: unknown) {
    paymentDescription = `Fetch ${url} (may require payment)`;
  }

  return executeWrite({
    toolName: "x402_fetch",
    description: paymentDescription,
    params: toExecutorParams(x402FetchExecutorSchema.parse({ ...v.data, paymentChainId })),
    executor: executeFetchNow,
    riskLevel: "financial",
  });
}

async function executeFetchNow(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      url,
      method = "GET",
      body,
      headers,
      paymentChainId,
    } = x402FetchExecutorSchema.parse(params);

    const walletState = getWalletState();
    const chainId = paymentChainId ?? walletState.chainId ?? 8453;
    const { fetchWithPayment } = createX402Client(chainId);

    const response = await fetchWithPayment(url, {
      method,
      body: body ?? undefined,
      headers,
    });

    const responseText = await response.text();
    return formatToolResponse({
      status: response.status,
      ok: response.ok,
      body: responseText,
    });
  } catch (e: unknown) {
    return formatToolError("X402_FETCH_ERROR", e instanceof Error ? e.message : String(e));
  }
}

export function getX402ToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "x402_check_requirements",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Check if a URL requires x402 payment. Returns payment requirements (amount, network, token) or confirms no payment needed. Use before x402_fetch to preview costs.",
      inputSchema: zodToJsonSchema(x402CheckRequirementsSchema) as Record<string, unknown>,
      handler: x402CheckRequirements,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "x402_fetch",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Fetch a URL, automatically paying via x402 protocol if required. Checks payment cost first, queues confirmation if payment needed, then executes. No-op if no payment required.",
      inputSchema: zodToJsonSchema(x402FetchSchema) as Record<string, unknown>,
      handler: x402Fetch,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerX402Executors(): void {
  registerExecutor("x402_fetch", executeFetchNow);
}
