import { z } from "zod";
import { chainIdOptionalSchema } from "./common.js";
import { limitSchema, protocolSlugSchema } from "./market.js";

// ── Security & Due Diligence ────────────────────────────────────

export const researchContractSecuritySchema = z.object({
  address: z.string().describe("Contract address to check"),
  chainId: chainIdOptionalSchema,
});

export const researchTokenDueDiligenceSchema = z.object({
  token: z.string().describe("Token address or symbol to investigate"),
  chainId: chainIdOptionalSchema,
});

export const researchTokenHoldersSchema = z.object({
  token: z.string().describe("Token contract address"),
  chainId: chainIdOptionalSchema,
  limit: limitSchema,
});

// ── Yields ──────────────────────────────────────────────────────

export const researchYieldOpportunitiesSchema = z.object({
  token: z.string().optional().describe("Filter by token symbol"),
  chain: z.string().optional().describe("Filter by chain name"),
  protocol: z.string().optional().describe("Filter by protocol name"),
  minTvl: z.number().optional().describe("Minimum TVL in USD (default: 100000)"),
  limit: limitSchema,
});

export const researchCompareYieldsSchema = z.object({
  token: z.string().describe("Token symbol to compare yields for"),
  chainId: chainIdOptionalSchema,
  limit: limitSchema,
});

export const researchProtocolInfoSchema = z.object({
  protocol: protocolSlugSchema,
});

// ── DefiLlama Feed Tools ────────────────────────────────────────

export const researchTokenUnlocksSchema = z.object({
  limit: limitSchema,
});

export const researchHackHistorySchema = z.object({
  protocol: z.string().optional().describe("Filter by protocol name"),
  limit: limitSchema,
});

export const researchFundRaisesSchema = z.object({
  limit: limitSchema,
});

export const researchWhaleTransfersSchema = z.object({
  symbol: z.string().optional().describe("Filter by token symbol"),
  limit: limitSchema,
});

export const researchGovernanceSchema = z.object({
  protocol: z.string().optional().describe("Filter by protocol/org name"),
  status: z.enum(["active", "closed"]).optional().describe("Filter by proposal status"),
  limit: limitSchema,
});

export const researchNewsSchema = z.object({
  limit: limitSchema,
});

export const researchAirdropsSchema = z.object({
  limit: limitSchema,
});
