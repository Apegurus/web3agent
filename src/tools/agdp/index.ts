import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  type AgdpAgent,
  createJobViaApi,
  getJobs,
  getOfferingById,
  searchOfferings,
} from "../../agdp/api.js";
import type { ToolCategory } from "../../runtime/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  agdpCreateOfferingSchema,
  agdpGetMyJobsSchema,
  agdpGetOfferingSchema,
  agdpGetOfferingsSchema,
  agdpHireAgentSchema,
} from "./schemas.js";

const agdpGetOfferings = createToolHandler(
  agdpGetOfferingsSchema,
  async (input: { query?: string; topK?: number }) => {
    const agents = await searchOfferings({
      query: input.query,
      topK: input.topK ?? 10,
    });
    return {
      count: agents.length,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        walletAddress: a.walletAddress,
        metrics: a.metrics,
        offerings: a.jobs,
      })),
    };
  },
  "AGDP_ERROR"
);

async function agdpGetOffering(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpGetOfferingSchema, params);
  if (!v.success) return v.error;
  try {
    const agent = await getOfferingById(v.data.offeringId);
    if (!agent) return formatToolError("NOT_FOUND", `Agent ${v.data.offeringId} not found`);
    return formatToolResponse(agent);
  } catch (e: unknown) {
    return formatToolError("AGDP_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function agdpGetMyJobs(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpGetMyJobsSchema, params);
  if (!v.success) return v.error;
  const walletState = getWalletState();
  if (!walletState.address)
    return formatToolError("WALLET_REQUIRED", "Activate a wallet first to view your jobs");
  try {
    const jobs = await getJobs({
      walletAddress: walletState.address,
      status: v.data.status ?? "active",
    });
    return formatToolResponse({ count: jobs.length, jobs });
  } catch (e: unknown) {
    return formatToolError("AGDP_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function executeHireAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { offeringId, serviceRequirements, _cachedAgent } = params as {
      offeringId: number | string;
      serviceRequirements?: Record<string, unknown>;
      _cachedAgent?: AgdpAgent;
    };

    const agent = _cachedAgent ?? (await getOfferingById(offeringId));
    if (!agent)
      return formatToolError(
        "NOT_FOUND",
        `Agent ${offeringId} not found in aGDP marketplace. Try agdp_get_offerings with a more specific query.`
      );

    // Hire via aGDP API (the on-chain ACP job creation should be done
    // separately using acp_create_job which targets the actual Virtuals ACPRouter V2)
    const firstOffering = agent.jobs?.[0];
    const result = await createJobViaApi({
      providerWalletAddress: agent.walletAddress,
      jobOfferingName: firstOffering?.name ?? agent.name,
      serviceRequirements,
    });
    return formatToolResponse({
      status: "hired_via_api",
      agent: { id: agent.id, name: agent.name },
      job: result,
    });
  } catch (e: unknown) {
    return formatToolError("AGDP_HIRE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function agdpHireAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpHireAgentSchema, params);
  if (!v.success) return v.error;

  let description = `Hire agent ${v.data.offeringId}`;
  let cachedAgent: AgdpAgent | null = null;
  try {
    cachedAgent = await getOfferingById(v.data.offeringId);
    if (cachedAgent) {
      const price = cachedAgent.jobs?.[0]?.price;
      description = `Hire agent "${cachedAgent.name}" (ID: ${cachedAgent.id})${price !== undefined ? ` for $${price}` : ""}`;
    }
  } catch (_error: unknown) {
    // Best-effort enrichment only; the write flow can continue without cached offering details.
  }

  return executeWrite({
    toolName: "agdp_hire_agent",
    description,
    params: { ...v.data, _cachedAgent: cachedAgent } as unknown as Record<string, unknown>,
    executor: executeHireAgent,
  });
}

async function agdpCreateOffering(_params: Record<string, unknown>): Promise<CallToolResult> {
  return formatToolError(
    "NOT_SUPPORTED",
    "Listing on agdp.io requires a LITE_AGENT_API_KEY from Virtuals Protocol. " +
      "Visit https://agdp.io/join to register, then use the aGDP CLI: npx openclaw-acp sell create"
  );
}

const CATEGORY: ToolCategory = "agenticEconomy";

export function getAgdpToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "agdp_get_offerings",
      category: CATEGORY,
      description:
        "Search the aGDP marketplace for AI agent offerings. " +
        "Returns agent profiles with capabilities, metrics, and available services.",
      inputSchema: zodToJsonSchema(agdpGetOfferingsSchema) as Record<string, unknown>,
      handler: agdpGetOfferings,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_get_offering",
      category: CATEGORY,
      description: "Get detailed information about a specific agent offering by ID.",
      inputSchema: zodToJsonSchema(agdpGetOfferingSchema) as Record<string, unknown>,
      handler: agdpGetOffering,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_get_my_jobs",
      category: CATEGORY,
      description:
        "List your active or completed jobs from the aGDP marketplace. Requires an active wallet.",
      inputSchema: zodToJsonSchema(agdpGetMyJobsSchema) as Record<string, unknown>,
      handler: agdpGetMyJobs,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_hire_agent",
      category: CATEGORY,
      description:
        "Hire an AI agent from the aGDP marketplace via API (write operation, requires wallet and confirmation). " +
        "For on-chain job creation, use acp_create_job separately.",
      inputSchema: zodToJsonSchema(agdpHireAgentSchema) as Record<string, unknown>,
      handler: agdpHireAgent,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "agdp_create_offering",
      category: CATEGORY,
      description:
        "Create a new offering on the aGDP marketplace. NOTE: requires a LITE_AGENT_API_KEY from Virtuals — visit agdp.io/join to register.",
      inputSchema: zodToJsonSchema(agdpCreateOfferingSchema) as Record<string, unknown>,
      handler: agdpCreateOffering,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function registerAgdpExecutors(): void {
  registerExecutor("agdp_hire_agent", executeHireAgent);
}
