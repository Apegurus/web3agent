import { z } from "zod";

const chainIdParam = z.number().optional().describe("Chain ID (defaults to runtime config)");

export const erc8183CreateJobSchema = z.object({
  provider: z.string().describe("Provider wallet address"),
  evaluator: z.string().describe("Evaluator wallet address"),
  description: z.string().describe("Job description"),
  expiryDuration: z.number().describe("Job expiry in seconds from now"),
  hook: z.string().optional().describe("Hook address (default zero address)"),
  chainId: chainIdParam,
});

export const erc8183SetBudgetSchema = z.object({
  jobId: z.number().describe("Job ID"),
  amount: z.string().describe("Budget amount in token smallest units"),
  chainId: chainIdParam,
});

export const erc8183FundJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  expectedBudget: z.string().describe("Expected budget amount in token smallest units"),
  chainId: chainIdParam,
});

export const erc8183SubmitJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  deliverable: z.string().describe("Deliverable description (will be keccak256 hashed)"),
  chainId: chainIdParam,
});

export const erc8183CompleteJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Completion reason"),
  chainId: chainIdParam,
});

export const erc8183RejectJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  reason: z.string().optional().describe("Rejection reason"),
  chainId: chainIdParam,
});

export const erc8183ClaimRefundSchema = z.object({
  jobId: z.number().describe("Job ID"),
  chainId: chainIdParam,
});

export const erc8183GetJobSchema = z.object({
  jobId: z.number().describe("Job ID"),
  chainId: chainIdParam,
});
