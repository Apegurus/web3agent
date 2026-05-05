import { z } from "zod";

export const ccxtMarketTypeSchema = z
  .enum(["spot", "margin", "future", "swap", "option"])
  .describe("Exchange market type to target when an exchange supports multiple product families");

export const ccxtExchangeIdSchema = z
  .string()
  .min(1)
  .describe("CCXT exchange ID (for example: 'binance', 'kraken', 'bybit')");

export const ccxtAccountNameSchema = z
  .string()
  .min(1)
  .describe("Configured CCXT account name from the JSON file referenced by CCXT_CONFIG_PATH");

export const ccxtMethodSchema = z
  .string()
  .min(1)
  .describe(
    "CCXT method name to invoke, including unified methods like 'fetchTicker' or implicit methods like 'publicGetTicker'"
  );

export const ccxtArgsSchema = z
  .array(z.unknown())
  .optional()
  .describe(
    "Positional arguments for the target CCXT method, in the same order that CCXT expects them"
  );

export const ccxtParamsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Optional CCXT params object passed as the final argument when the target method accepts exchange-specific overrides"
  );

export const ccxtLoadMarketsSchema = z
  .boolean()
  .optional()
  .describe(
    "Whether to call loadMarkets before invocation when market metadata is needed (default: true)"
  );

export const ccxtReloadMarketsSchema = z
  .boolean()
  .optional()
  .describe(
    "Whether to force a fresh market reload instead of reusing cached exchange metadata (default: false)"
  );

export const ccxtListExchangesSchema = z.object({
  configuredOnly: z
    .boolean()
    .optional()
    .describe(
      "Deprecated alias for hasAuth=true; return only exchanges that have at least one configured authenticated account"
    ),
  hasAuth: z
    .boolean()
    .optional()
    .describe(
      "Preferred auth filter. When true, return only exchanges with configured authenticated accounts; when false, return only exchanges without them"
    ),
  marketType: ccxtMarketTypeSchema.optional(),
});

export const ccxtDescribeExchangeSchema = z
  .object({
    exchange: ccxtExchangeIdSchema
      .optional()
      .describe("Exchange ID to inspect (at least one of exchange or account is required)"),
    account: ccxtAccountNameSchema
      .optional()
      .describe(
        "Configured account name to inspect (at least one of exchange or account is required)"
      ),
    loadMarkets: ccxtLoadMarketsSchema,
    reloadMarkets: ccxtReloadMarketsSchema,
  })
  .refine((value) => Boolean(value.exchange || value.account), {
    message: "Either exchange or account is required",
    path: ["exchange"],
  });

export const ccxtListAccountsSchema = z
  .object({})
  .describe("List all configured CCXT accounts with redacted metadata");

export const ccxtPublicCallSchema = z.object({
  exchange: ccxtExchangeIdSchema,
  method: ccxtMethodSchema,
  args: ccxtArgsSchema,
  params: ccxtParamsSchema,
  marketType: ccxtMarketTypeSchema.optional(),
  sandbox: z
    .boolean()
    .optional()
    .describe("Whether to enable exchange sandbox mode when supported by the selected exchange"),
  loadMarkets: ccxtLoadMarketsSchema,
  reloadMarkets: ccxtReloadMarketsSchema,
});

export const ccxtPrivateReadSchema = z.object({
  account: ccxtAccountNameSchema,
  method: ccxtMethodSchema,
  args: ccxtArgsSchema,
  params: ccxtParamsSchema,
  loadMarkets: ccxtLoadMarketsSchema,
  reloadMarkets: ccxtReloadMarketsSchema,
});

export const ccxtPrivateWriteSchema = z.object({
  account: ccxtAccountNameSchema,
  method: ccxtMethodSchema,
  args: ccxtArgsSchema,
  params: ccxtParamsSchema,
  loadMarkets: ccxtLoadMarketsSchema,
  reloadMarkets: ccxtReloadMarketsSchema,
});
