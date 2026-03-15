import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCategory } from "../../runtime/types.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import { createX402Client, probePaymentRequirements } from "../../x402/client.js";
import { x402CheckRequirementsSchema, x402FetchSchema } from "./schemas.js";

async function x402CheckRequirements(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(x402CheckRequirementsSchema, params);
  if (!v.success) return v.error;
  const { url, method, headers } = v.data;

  try {
    const { requirements } = await probePaymentRequirements(url, method, headers);
    if (!requirements) {
      return formatToolResponse({
        paymentRequired: false,
        message: "No payment required for this URL",
      });
    }
    return formatToolResponse({
      paymentRequired: true,
      requirements,
    });
  } catch (e: unknown) {
    return formatToolError("X402_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function x402Fetch(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(x402FetchSchema, params);
  if (!v.success) return v.error;
  const { url, method, headers } = v.data;

  let paymentDescription: string;
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
  } catch (_error: unknown) {
    paymentDescription = `Fetch ${url} (may require payment)`;
  }

  return executeWrite({
    toolName: "x402_fetch",
    description: paymentDescription,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeFetchNow,
  });
}

async function executeFetchNow(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      url,
      method = "GET",
      body,
      headers,
    } = params as {
      url: string;
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    };

    const walletState = getWalletState();
    const chainId = walletState.chainId ?? 8453;
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
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL to check for payment requirements",
          },
          method: {
            type: "string",
            description: "HTTP method (default GET)",
            enum: ["GET", "POST", "PUT", "DELETE"],
          },
          headers: {
            type: "object",
            description: "Optional request headers",
            additionalProperties: { type: "string" },
          },
        },
        required: ["url"],
      },
      handler: x402CheckRequirements,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "x402_fetch",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Fetch a URL, automatically paying via x402 protocol if required. Checks payment cost first, queues confirmation if payment needed, then executes. No-op if no payment required.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "URL to fetch" },
          method: {
            type: "string",
            description: "HTTP method (default GET)",
            enum: ["GET", "POST", "PUT", "DELETE"],
          },
          body: {
            type: "string",
            description: "Request body (for POST/PUT)",
          },
          headers: {
            type: "object",
            description: "Optional request headers",
            additionalProperties: { type: "string" },
          },
        },
        required: ["url"],
      },
      handler: x402Fetch,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerX402Executors(): void {
  registerExecutor("x402_fetch", executeFetchNow);
}
