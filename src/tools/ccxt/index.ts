import ccxt from "ccxt";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  CcxtPrivateReadInput,
  CcxtPrivateWriteInput,
  CcxtPublicCallInput,
  DescribeCcxtExchangeInput,
  ListCcxtExchangesInput,
} from "../../api/types.js";
import { listAccountSummaries, resolveExchangeIdFromAccount } from "../../ccxt/accounts.js";
import { describeExchangeCapabilities } from "../../ccxt/capabilities.js";
import { loadCcxtAccountRegistry } from "../../ccxt/config.js";
import { CcxtExchangeFactory } from "../../ccxt/factory.js";
import {
  invokeCcxtPrivateRead,
  invokeCcxtPrivateWrite,
  invokeCcxtPublicCall,
} from "../../ccxt/invoke.js";
import { getConfig } from "../../config/env.js";
import { isPlainObject } from "../../utils/type-guards.js";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  ccxtDescribeExchangeSchema,
  ccxtListAccountsSchema,
  ccxtListExchangesSchema,
  ccxtPrivateReadSchema,
  ccxtPrivateWriteSchema,
  ccxtPublicCallSchema,
} from "./schemas.js";

const CCXT_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const CCXT_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

interface CcxtRuntimeState {
  factory: CcxtExchangeFactory;
  registry: ReturnType<typeof loadCcxtAccountRegistry>;
}

const runtimeStateCache = new Map<string, CcxtRuntimeState>();

function getCcxtRuntimeState(): CcxtRuntimeState {
  const config = getConfig();
  const cacheKey = config.ccxtConfigPath ?? "__no-ccxt-config__";
  const cached = runtimeStateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registry = loadCcxtAccountRegistry({ ccxtConfigPath: config.ccxtConfigPath });
  for (const warning of registry.warnings) {
    process.stderr.write(`[ccxt] ${warning}\n`);
  }

  const state = {
    factory: new CcxtExchangeFactory(registry),
    registry,
  };
  runtimeStateCache.set(cacheKey, state);
  return state;
}

function listExchanges(input: {
  configuredOnly?: boolean;
  hasAuth?: boolean;
  marketType?: "spot" | "margin" | "future" | "swap" | "option";
}) {
  const { registry } = getCcxtRuntimeState();

  return ccxt.exchanges
    .map((exchangeId) => {
      const ExchangeConstructor = (ccxt as unknown as Record<string, unknown>)[exchangeId];
      if (typeof ExchangeConstructor !== "function") {
        return null;
      }

      const exchange = new (ExchangeConstructor as new () => {
        id: string;
        name?: string;
        countries?: string[];
        urls?: Record<string, string | Record<string, string>>;
        has?: Record<string, boolean | "emulated" | undefined>;
        timeframes?: Record<string, string>;
      })();

      if (input.marketType && !exchange.has?.[input.marketType]) {
        return null;
      }

      const configuredAccounts = registry.accounts
        .filter((account) => account.exchangeId === exchangeId)
        .map((account) => account.name);
      const hasConfiguredAuth = configuredAccounts.length > 0;

      if (input.configuredOnly && !hasConfiguredAuth) {
        return null;
      }
      if (input.hasAuth === true && !hasConfiguredAuth) {
        return null;
      }
      if (input.hasAuth === false && hasConfiguredAuth) {
        return null;
      }

      return {
        exchangeId: exchange.id ?? exchangeId,
        name: exchange.name ?? exchangeId,
        countries: Array.isArray(exchange.countries) ? exchange.countries : undefined,
        urls: isPlainObject(exchange.urls) ? exchange.urls : undefined,
        configuredAccounts,
        supportsPublic: true,
        supportsPrivate: hasConfiguredAuth,
        timeframes: exchange.timeframes ? Object.keys(exchange.timeframes) : undefined,
      };
    })
    .filter((exchange): exchange is NonNullable<typeof exchange> => exchange !== null);
}

async function describeExchange(input: {
  exchange?: string;
  account?: string;
  loadMarkets?: boolean;
  reloadMarkets?: boolean;
}) {
  const { factory, registry } = getCcxtRuntimeState();
  if (input.account) {
    const exchangeId = resolveExchangeIdFromAccount(registry, input.account);
    if (!exchangeId) {
      throw new Error(`Unknown CCXT account: ${input.account}`);
    }
    const exchange = await factory.getPrivateExchange({
      accountName: input.account,
      loadMarkets: input.loadMarkets,
      reloadMarkets: input.reloadMarkets,
    });
    const configuredAccounts = registry.accounts
      .filter((account) => account.exchangeId === exchangeId)
      .map((account) => account.name);
    return describeExchangeCapabilities(exchange, configuredAccounts);
  }

  const exchange = await factory.getPublicExchange({
    exchangeId: input.exchange ?? "",
    loadMarkets: input.loadMarkets,
    reloadMarkets: input.reloadMarkets,
  });
  const configuredAccounts = registry.accounts
    .filter((account) => account.exchangeId === exchange.id)
    .map((account) => account.name);
  return describeExchangeCapabilities(exchange, configuredAccounts);
}

function listAccounts() {
  const { registry } = getCcxtRuntimeState();
  return listAccountSummaries(registry);
}

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
} as const;

export function getCcxtToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "ccxt_list_exchanges",
      category: "market",
      description:
        "List CCXT-supported exchanges and summarize which ones have configured authenticated accounts, " +
        "public market access, and available market-type metadata.",
      inputSchema: zodToJsonSchema(ccxtListExchangesSchema) as Record<string, unknown>,
      handler: createToolHandler(
        ccxtListExchangesSchema,
        async (input: ListCcxtExchangesInput) => listExchanges(input),
        "CCXT_LIST_EXCHANGES_ERROR"
      ),
      annotations: CCXT_READ_ANNOTATIONS,
    },
    {
      name: "ccxt_describe_exchange",
      category: "market",
      description:
        "Inspect a CCXT exchange or configured account and return supported methods, market types, timeframes, " +
        "symbols, and invocation modes so callers can route requests safely.",
      inputSchema: zodToJsonSchema(ccxtDescribeExchangeSchema) as Record<string, unknown>,
      handler: createToolHandler(
        ccxtDescribeExchangeSchema,
        async (input: DescribeCcxtExchangeInput) => describeExchange(input),
        "CCXT_DESCRIBE_EXCHANGE_ERROR"
      ),
      annotations: CCXT_READ_ANNOTATIONS,
    },
    {
      name: "ccxt_list_accounts",
      category: "market",
      description:
        "List configured CCXT accounts from CCXT_CONFIG_PATH with redacted metadata only. " +
        "Secrets are never returned.",
      inputSchema: EMPTY_INPUT_SCHEMA as Record<string, unknown>,
      handler: createToolHandler(
        ccxtListAccountsSchema,
        async () => listAccounts(),
        "CCXT_LIST_ACCOUNTS_ERROR"
      ),
      annotations: CCXT_READ_ANNOTATIONS,
    },
    {
      name: "ccxt_public_call",
      category: "market",
      description:
        "Invoke a public CCXT unified or implicit method on a selected exchange. " +
        "Use ccxt_describe_exchange first for capability discovery when calling niche methods.",
      inputSchema: zodToJsonSchema(ccxtPublicCallSchema) as Record<string, unknown>,
      handler: createToolHandler(
        ccxtPublicCallSchema,
        async (input: CcxtPublicCallInput) => invokeCcxtPublicCall(input, getCcxtRuntimeState().factory),
        "CCXT_PUBLIC_CALL_ERROR"
      ),
      annotations: CCXT_READ_ANNOTATIONS,
    },
    {
      name: "ccxt_private_read",
      category: "market",
      description:
        "Invoke an authenticated read-only CCXT method using a configured named account. " +
        "This covers balances, positions, orders, fills, and private implicit GET-style endpoints.",
      inputSchema: zodToJsonSchema(ccxtPrivateReadSchema) as Record<string, unknown>,
      handler: createToolHandler(
        ccxtPrivateReadSchema,
        async (input: CcxtPrivateReadInput) =>
          invokeCcxtPrivateRead(input, getCcxtRuntimeState().factory),
        "CCXT_PRIVATE_READ_ERROR"
      ),
      annotations: CCXT_READ_ANNOTATIONS,
    },
    {
      name: "ccxt_private_write",
      category: "orders",
      description:
        "Invoke an authenticated mutating CCXT method using a configured named account. " +
        "This covers order placement, cancellation, leverage, transfers, withdrawals, and private implicit write endpoints.",
      inputSchema: zodToJsonSchema(ccxtPrivateWriteSchema) as Record<string, unknown>,
      handler: createToolHandler(
        ccxtPrivateWriteSchema,
        async (input: CcxtPrivateWriteInput) =>
          invokeCcxtPrivateWrite(input, getCcxtRuntimeState().factory),
        "CCXT_PRIVATE_WRITE_ERROR"
      ),
      riskLevel: "financial",
      annotations: CCXT_WRITE_ANNOTATIONS,
    },
  ];
}
