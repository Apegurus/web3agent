import { z } from "zod";

export const resolveTokenSchema = z.object({
  symbol: z
    .string({ required_error: "symbol is required" })
    .describe("Token symbol (e.g. 'USDT', 'USDC', 'WETH', 'WBNB', 'DAI')"),
  chainId: z
    .number({ required_error: "chainId is required" })
    .describe(
      "EVM chain ID (e.g. 1=Ethereum, 56=BSC, 137=Polygon, 8453=Base, 59144=Linea, 42161=Arbitrum, 10=Optimism)"
    ),
});

export const listChainTokensSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }).describe("EVM chain ID"),
});
