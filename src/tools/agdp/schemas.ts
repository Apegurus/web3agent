import { z } from "zod";

export const agdpGetOfferingsSchema = z.object({
  query: z.string().optional().describe("Search query for agent offerings"),
  topK: z.number().optional().describe("Max results (default 10)"),
});

export const agdpGetOfferingSchema = z.object({
  offeringId: z.union([z.number(), z.string()]).describe("Agent ID from agdp_get_offerings"),
});

export const agdpHireAgentSchema = z.object({
  offeringId: z.union([z.number(), z.string()]).describe("Agent ID to hire"),
  serviceRequirements: z.record(z.unknown()).optional().describe("Service requirements"),
  chainId: z.number().optional(),
});

export const agdpGetMyJobsSchema = z.object({
  status: z
    .enum(["active", "completed"])
    .optional()
    .describe("Job status filter (default: active)"),
});

export const agdpCreateOfferingSchema = z.object({
  name: z.string().describe("Offering name"),
  description: z.string().describe("Offering description"),
  price: z.number().describe("Price in USD"),
  category: z.string().optional().describe("Offering category"),
});
