import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, zeroAddress } from "viem";
import { erc8183Abi, getAcpAddress } from "../../acp/contract.js";
import {
  type AgdpAgent,
  createJobViaApi,
  createOfferingViaApi,
  getJobs,
  getOfferingById,
  searchOfferings,
} from "../../agdp/api.js";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { createWalletClientForChain, getTransportForChain } from "../../config/wallet-factory.js";
import type { ToolCategory } from "../../runtime/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import type { ToolDefinition } from "../register.js";
import {
  agdpCreateOfferingSchema,
  agdpGetMyJobsSchema,
  agdpGetOfferingSchema,
  agdpGetOfferingsSchema,
  agdpHireAgentSchema,
} from "./schemas.js";

async function agdpGetOfferings(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpGetOfferingsSchema, params);
  if (!v.success) return v.error;
  try {
    const agents = await searchOfferings({
      query: v.data.query,
      topK: v.data.topK ?? 10,
    });
    return formatToolResponse({
      count: agents.length,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        walletAddress: a.walletAddress,
        metrics: a.metrics,
        offerings: a.jobs,
      })),
    });
  } catch (e: unknown) {
    return formatToolError("AGDP_ERROR", String(e));
  }
}

async function agdpGetOffering(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpGetOfferingSchema, params);
  if (!v.success) return v.error;
  try {
    const agent = await getOfferingById(v.data.offeringId);
    if (!agent) return formatToolError("NOT_FOUND", `Agent ${v.data.offeringId} not found`);
    return formatToolResponse(agent);
  } catch (e: unknown) {
    return formatToolError("AGDP_ERROR", String(e));
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
    return formatToolError("AGDP_ERROR", String(e));
  }
}

async function executeHireAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { offeringId, serviceRequirements } = params as {
      offeringId: number | string;
      serviceRequirements?: Record<string, unknown>;
    };

    const agent = await getOfferingById(offeringId);
    if (!agent)
      return formatToolError("NOT_FOUND", `Agent ${offeringId} not found in aGDP marketplace`);

    const acpAddress = getAcpAddress();

    if (acpAddress) {
      const chainId = (params.chainId as number | undefined) ?? getConfig().chainId;
      const account = getActiveAccount();
      const chain = getChainById(chainId);
      if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} is not supported`);

      const walletClient = createWalletClientForChain(account, chainId);
      const publicClient = createPublicClient({
        chain,
        transport: getTransportForChain(chainId),
      });

      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 86400);

      const hash = await walletClient.writeContract({
        address: acpAddress as `0x${string}`,
        abi: erc8183Abi,
        functionName: "createJob",
        args: [
          agent.walletAddress as `0x${string}`,
          zeroAddress,
          expiredAt,
          `Hired via aGDP: ${agent.name}`,
          zeroAddress,
        ],
        chain,
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      return formatToolResponse({
        status: "hired_on_chain",
        agent: {
          id: agent.id,
          name: agent.name,
          walletAddress: agent.walletAddress,
        },
        txHash: hash,
      });
    }

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
    return formatToolError("AGDP_HIRE_ERROR", String(e));
  }
}

async function agdpHireAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpHireAgentSchema, params);
  if (!v.success) return v.error;

  let description = `Hire agent ${v.data.offeringId}`;
  try {
    const offering: AgdpAgent | null = await getOfferingById(v.data.offeringId);
    if (offering) {
      const price = offering.jobs?.[0]?.price;
      description = `Hire agent "${offering.name}" (ID: ${offering.id})${price !== undefined ? ` for $${price}` : ""}`;
    }
    // biome-ignore lint/suspicious/noEmptyBlockStatements: proceed without offering details — best-effort enrichment
  } catch {}

  return executeWrite({
    toolName: "agdp_hire_agent",
    description,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeHireAgent,
  });
}

async function executeCreateOffering(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const walletState = getWalletState();
    const result = await createOfferingViaApi({
      ...(params as {
        name: string;
        description: string;
        price: number;
        category?: string;
      }),
      walletAddress: walletState.address ?? "",
    });
    return formatToolResponse(result);
  } catch (e: unknown) {
    return formatToolError("NOT_SUPPORTED", String(e));
  }
}

async function agdpCreateOffering(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(agdpCreateOfferingSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "agdp_create_offering",
    description: `Create aGDP offering: "${v.data.name}" at $${v.data.price}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeCreateOffering,
  });
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
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query for agent offerings",
          },
          topK: {
            type: "number",
            description: "Max results (default 10)",
          },
        },
        required: [],
      },
      handler: agdpGetOfferings,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_get_offering",
      category: CATEGORY,
      description: "Get detailed information about a specific agent offering by ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          offeringId: {
            type: ["number", "string"],
            description: "Agent ID from agdp_get_offerings",
          },
        },
        required: ["offeringId"],
      },
      handler: agdpGetOffering,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_get_my_jobs",
      category: CATEGORY,
      description:
        "List your active or completed jobs from the aGDP marketplace. Requires an active wallet.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["active", "completed"],
            description: "Job status filter (default: active)",
          },
        },
        required: [],
      },
      handler: agdpGetMyJobs,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "agdp_hire_agent",
      category: CATEGORY,
      description:
        "Hire an AI agent from the aGDP marketplace (write operation, requires wallet and confirmation). " +
        "Creates an on-chain ACP job if configured, otherwise uses the aGDP API.",
      inputSchema: {
        type: "object" as const,
        properties: {
          offeringId: {
            type: ["number", "string"],
            description: "Agent ID to hire",
          },
          serviceRequirements: {
            type: "object",
            description: "Service requirements",
          },
          chainId: {
            type: "number",
            description: "Chain ID for on-chain job (defaults to configured chain)",
          },
        },
        required: ["offeringId"],
      },
      handler: agdpHireAgent,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "agdp_create_offering",
      category: CATEGORY,
      description:
        "Create a new offering on the aGDP marketplace (write operation, requires wallet and confirmation).",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Offering name" },
          description: {
            type: "string",
            description: "Offering description",
          },
          price: { type: "number", description: "Price in USD" },
          category: {
            type: "string",
            description: "Offering category",
          },
        },
        required: ["name", "description", "price"],
      },
      handler: agdpCreateOffering,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerAgdpExecutors(): void {
  registerExecutor("agdp_hire_agent", executeHireAgent);
  registerExecutor("agdp_create_offering", executeCreateOffering);
}
