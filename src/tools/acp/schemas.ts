import { z } from "zod";

const chainIdParam = z.number().optional();

export const acpCreateJobSchema = z.object({
  provider: z.string().describe("Provider wallet address"),
  evaluator: z.string().describe("Evaluator wallet address"),
  description: z.string().describe("Job description"),
  expiryDuration: z.number().describe("Job expiry in seconds from now"),
  hook: z.string().optional().describe("Hook address (default zero address)"),
  chainId: chainIdParam,
});

export const acpSetBudgetSchema = z.object({
  jobId: z.number().describe("Job ID"),
  amount: z.string().describe("Budget amount in token smallest units"),
  chainId: chainIdParam,
});

export const acpFundJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  expectedBudget: z.string().describe("Expected budget amount in token smallest units"),
  chainId: chainIdParam,
});

export const acpSubmitJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  deliverable: z.string().describe("Deliverable description (will be keccak256 hashed)"),
  chainId: chainIdParam,
});

export const acpCompleteJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Completion reason"),
  chainId: chainIdParam,
});

export const acpRejectJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Rejection reason"),
  chainId: chainIdParam,
});

export const acpClaimRefundSchema = z.object({
  jobId: z.number().describe("Job ID"),
  chainId: chainIdParam,
});

export const acpGetJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  chainId: chainIdParam,
});
