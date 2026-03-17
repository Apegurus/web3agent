import { z } from "zod";

export const policyGetSchema = z.object({
  includeRecentSpends: z
    .boolean()
    .optional()
    .describe("Include list of recent spend records (default false)"),
});
