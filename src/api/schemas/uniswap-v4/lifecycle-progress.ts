import { z } from "zod";
import { addressSchema, hexSchema } from "../common.js";
import { decimalIntegerSchema, uniswapV4PoolIdSchema } from "./primitives.js";

export const uniswapV4ProgressSchema = z
  .object({
    completed: z
      .record(
        z.discriminatedUnion("kind", [
          z.object({
            dataHash: uniswapV4PoolIdSchema.describe("Verified transaction input hash"),
            kind: z.literal("transaction").describe("Verified transaction completion"),
            to: addressSchema.describe("Verified transaction target"),
            txHash: hexSchema.describe("Confirmed transaction hash"),
            value: decimalIntegerSchema.describe("Verified transaction native value"),
          }),
        ])
      )
      .describe(
        "Verified on-chain transaction completions excluding signatures and signed calldata"
      ),
    nextActionIndex: z
      .number()
      .int()
      .min(0)
      .describe("Index of the only action eligible to advance"),
  })
  .describe(
    "Version 3 external-wallet progress without signature acceptance or derived transaction facts"
  );
