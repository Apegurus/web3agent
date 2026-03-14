import { z } from "zod";

const serviceSchema = z.object({
  name: z.string(),
  endpoint: z.string(),
  version: z.string().optional(),
});

export const erc8004RegisterSchema = z.object({
  name: z.string().describe("Agent name"),
  description: z.string().describe("Agent description"),
  mcpEndpoint: z.string().optional().describe("MCP endpoint URL (or use MCP_ENDPOINT_URL env var)"),
  services: z.array(serviceSchema).optional().describe("Additional services offered"),
  agentURI: z
    .string()
    .optional()
    .describe("Pre-hosted agent registration JSON URI (bypasses IPFS auto-pin)"),
  chainId: z.number().optional(),
});

export const erc8004GetAgentSchema = z
  .object({
    agentId: z.number().optional().describe("Agent token ID"),
    walletAddress: z.string().optional().describe("Agent wallet address (alternative to agentId)"),
    chainId: z.number().optional(),
  })
  .refine((d) => d.agentId !== undefined || d.walletAddress !== undefined, {
    message: "Either agentId or walletAddress must be provided",
  });

export const erc8004UpdateAgentSchema = z.object({
  agentId: z.number().describe("Agent token ID to update"),
  name: z.string().optional(),
  description: z.string().optional(),
  mcpEndpoint: z.string().optional(),
  services: z.array(serviceSchema).optional(),
  agentURI: z.string().optional().describe("New pre-hosted URI (bypasses IPFS auto-pin)"),
  chainId: z.number().optional(),
});

export const erc8004SubmitFeedbackSchema = z.object({
  agentId: z.number().describe("Agent token ID"),
  value: z.number().min(-100).max(100).describe("Feedback value (-100 to +100)"),
  tag1: z.string().optional().describe("Feedback tag 1"),
  tag2: z.string().optional().describe("Feedback tag 2"),
  endpoint: z.string().optional().describe("Service endpoint this feedback relates to"),
  feedbackDescription: z.string().optional().describe("Human-readable feedback text"),
  chainId: z.number().optional(),
});

export const erc8004GetFeedbackSchema = z.object({
  agentId: z.number().describe("Agent token ID"),
  tag1: z.string().optional().describe("Filter by tag 1"),
  tag2: z.string().optional().describe("Filter by tag 2"),
  chainId: z.number().optional(),
});
