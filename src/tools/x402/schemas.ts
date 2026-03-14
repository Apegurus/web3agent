import { z } from "zod";

export const x402CheckRequirementsSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
  headers: z.record(z.string()).optional(),
});

export const x402FetchSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
  body: z.string().optional(),
  headers: z.record(z.string()).optional(),
});
