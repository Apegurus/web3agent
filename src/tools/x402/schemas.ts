import { z } from "zod";

export const x402CheckRequirementsSchema = z.object({
  url: z.string().url().describe("URL to check for payment requirements"),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method (default GET)"),
  headers: z.record(z.string()).optional().describe("Optional request headers"),
});

export const x402FetchSchema = z.object({
  url: z.string().url().describe("URL to fetch"),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method (default GET)"),
  body: z.string().optional().describe("Request body (for POST/PUT)"),
  headers: z.record(z.string()).optional().describe("Optional request headers"),
});

export const x402FetchExecutorSchema = x402FetchSchema.extend({
  paymentChainId: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Internal resolved payment chain ID from x402 requirements"),
});
