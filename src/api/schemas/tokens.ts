import { z } from "zod";

export const resolveTokenSchema = z.object({
  symbol: z.string({ required_error: "symbol is required" }),
  chainId: z.number({ required_error: "chainId is required" }),
});

export const listChainTokensSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
});
