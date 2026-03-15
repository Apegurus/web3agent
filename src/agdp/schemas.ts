import { z } from "zod";

// --- Input Schemas ---

export const agdpSearchOfferingsInputSchema = z.object({
  query: z.string().optional().describe("Search query for agent offerings"),
  topK: z.number().optional().describe("Maximum number of results (default 10)"),
});

export const agdpGetOfferingByIdInputSchema = z.object({
  offeringId: z.union([z.number(), z.string()]).describe("Agent offering ID"),
});

export const agdpGetJobsInputSchema = z.object({
  walletAddress: z.string().describe("Wallet address to filter jobs by"),
  status: z
    .enum(["active", "completed"])
    .optional()
    .describe("Job status filter (default 'active')"),
});

export const agdpCreateJobInputSchema = z.object({
  providerWalletAddress: z.string().describe("Provider agent wallet address"),
  jobOfferingName: z.string().describe("Name of the job offering to hire for"),
  serviceRequirements: z
    .record(z.unknown())
    .optional()
    .describe("Optional service-specific parameters"),
});

// --- Output Schemas ---

export const agdpOfferingSchema = z.object({
  id: z.number().describe("Offering ID"),
  name: z.string().describe("Offering name"),
  description: z.string().describe("Offering description"),
  price: z.number().describe("Price in payment token units"),
  type: z.string().describe("Offering type"),
  requiredFunds: z.boolean().describe("Whether upfront funding is required"),
  slaMinutes: z.number().describe("Service level agreement in minutes"),
});

export const agdpAgentSchema = z.object({
  id: z.number().describe("Agent ID"),
  name: z.string().describe("Agent name"),
  description: z.string().describe("Agent description"),
  walletAddress: z.string().describe("Agent wallet address"),
  contractAddress: z.string().describe("Agent contract address"),
  metrics: z
    .object({
      successRate: z.number().nullable().describe("Historical success rate"),
      isOnline: z.boolean().describe("Whether agent is currently online"),
    })
    .describe("Agent performance metrics"),
  jobs: z.array(agdpOfferingSchema).describe("Available job offerings"),
});

export const agdpJobMemoSchema = z.object({
  nextPhase: z.string().describe("Phase after this memo"),
  content: z.string().describe("Memo content"),
  createdAt: z.string().describe("Creation timestamp"),
});

export const agdpJobSchema = z.object({
  id: z.number().describe("Job ID"),
  phase: z.string().describe("Current job phase"),
  providerName: z.string().describe("Provider agent name"),
  providerWalletAddress: z.string().describe("Provider wallet address"),
  clientWalletAddress: z.string().describe("Client wallet address"),
  deliverable: z.string().describe("Job deliverable content"),
  memos: z.array(agdpJobMemoSchema).describe("Job memo history"),
});

export const agdpJobResponseSchema = z
  .object({
    id: z.number().describe("Job ID"),
    phase: z.string().describe("Current job phase"),
    providerName: z.string().describe("Provider agent name"),
  })
  .passthrough();
