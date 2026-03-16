import { getConfig } from "../config/env.js";
import { resilientFetch } from "../utils/resilient-fetch.js";

export const AGDP_DEFAULT_URL = "https://acpx.virtuals.io/api";

export interface AgdpOffering {
  id: number;
  name: string;
  description: string;
  price: number;
  type: string;
  requiredFunds: boolean;
  slaMinutes: number;
}

export interface AgdpAgent {
  id: number;
  name: string;
  description: string;
  walletAddress: string;
  contractAddress: string;
  metrics: { successRate: number | null; isOnline: boolean };
  jobs: AgdpOffering[];
}

export interface AgdpJob {
  id: number;
  phase: string;
  providerName: string;
  providerWalletAddress: string;
  clientWalletAddress: string;
  deliverable: string;
  memos: Array<{ nextPhase: string; content: string; createdAt: string }>;
}

export interface AgdpJobResponse {
  id: number;
  phase: string;
  providerName: string;
  [key: string]: unknown;
}

export function getAgdpBaseUrl(): string {
  try {
    const config = getConfig();
    return config.agdpApiUrl ?? AGDP_DEFAULT_URL;
  } catch (e: unknown) {
    return AGDP_DEFAULT_URL;
  }
}

function flattenResponse<T>(body: unknown): T[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;

  if (Array.isArray(b.data)) {
    return b.data.map((item) => {
      if (typeof item === "object" && item !== null && "attributes" in item) {
        const { id, attributes } = item as { id: number; attributes: Record<string, unknown> };
        return { id, ...attributes } as T;
      }
      return item as T;
    });
  }

  if (Array.isArray(body)) {
    return body as T[];
  }

  return [];
}

async function agdpFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getAgdpBaseUrl();
  const response = await resilientFetch(
    `${baseUrl}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string> | undefined),
      },
    },
    { label: "agdp" }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`aGDP API error ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function searchOfferings(params: {
  query?: string;
  topK?: number;
}): Promise<AgdpAgent[]> {
  const { query = "", topK = 10 } = params;
  const qs = new URLSearchParams({
    query,
    topK: String(topK),
    searchMode: "hybrid",
  });
  const body = await agdpFetch<unknown>(`/agents/v5/search?${qs.toString()}`);

  if (Array.isArray(body)) return body as AgdpAgent[];
  return flattenResponse<AgdpAgent>(body);
}

export async function getOfferingById(
  offeringId: number | string,
  cachedAgents?: AgdpAgent[]
): Promise<AgdpAgent | null> {
  const agents = cachedAgents ?? (await searchOfferings({ topK: 500 }));
  return agents.find((a) => String(a.id) === String(offeringId)) ?? null;
}

export async function getJobs(params: {
  walletAddress: string;
  status?: "active" | "completed";
}): Promise<AgdpJob[]> {
  const { walletAddress, status = "active" } = params;
  const endpoint = status === "completed" ? "/acp/jobs/completed" : "/acp/jobs/active";
  const qs = new URLSearchParams({ walletAddress });
  const body = await agdpFetch<unknown>(`${endpoint}?${qs.toString()}`);
  if (Array.isArray(body)) return body as AgdpJob[];
  return flattenResponse<AgdpJob>(body);
}

export async function createJobViaApi(params: {
  providerWalletAddress: string;
  jobOfferingName: string;
  serviceRequirements?: Record<string, unknown>;
}): Promise<AgdpJobResponse> {
  return agdpFetch<AgdpJobResponse>("/acp/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function createOfferingViaApi(_params: {
  name: string;
  description: string;
  price: number;
  category?: string;
  walletAddress: string;
}): Promise<unknown> {
  throw new Error(
    "aGDP offering creation requires authenticated API access. " +
      "Use the aGDP CLI instead: npx virtuals-protocol-acp sell create"
  );
}
