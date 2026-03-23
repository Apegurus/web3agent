import { z } from "zod";
import { chainIdOptionalSchema } from "../../api/schemas/common.js";

export const acpVCreateJobSchema = z.object({
  provider: z.string().describe("Provider wallet address"),
  evaluator: z.string().describe("Evaluator wallet address"),
  description: z.string().describe("Job description / metadata"),
  expiryDuration: z.number().describe("Job expiry in seconds from now"),
  paymentToken: z.string().optional().describe("ERC-20 payment token address (defaults to USDC)"),
  budget: z
    .string()
    .optional()
    .describe("Initial budget in token smallest units (default 0, set later via acp_set_budget)"),
  chainId: chainIdOptionalSchema,
});

export const acpVSetBudgetSchema = z.object({
  jobId: z.number().describe("Job ID"),
  amount: z.string().describe("Budget amount in token smallest units"),
  paymentToken: z.string().optional().describe("Payment token address (defaults to USDC)"),
  chainId: chainIdOptionalSchema,
});

export const acpVFundJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  amount: z.string().describe("Funding amount in token smallest units"),
  expiredAt: z
    .number()
    .optional()
    .describe("Memo expiry as Unix timestamp (defaults to job expiry)"),
  chainId: chainIdOptionalSchema,
});

export const acpVSubmitJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  deliverable: z.string().describe("Deliverable content (text, URL, or JSON)"),
  chainId: chainIdOptionalSchema,
});

export const acpVCompleteJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Completion reason"),
  chainId: chainIdOptionalSchema,
});

export const acpVRejectJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Rejection reason"),
  chainId: chainIdOptionalSchema,
});

export const acpVClaimRefundSchema = z.object({
  jobId: z.number().describe("Job ID"),
  chainId: chainIdOptionalSchema,
});

export const acpVGetJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  memoLimit: z.number().optional().describe("Max memos to return (default 100)"),
  chainId: chainIdOptionalSchema,
});
