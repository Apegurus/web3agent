import { z } from "zod";

// --- Output Schemas ---

export const x402ProbeResultSchema = z.object({
  requirements: z.unknown().nullable().describe("Payment requirements (null if no payment needed)"),
});
