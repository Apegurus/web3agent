import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import ccxt from "ccxt";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  CcxtPrivateReadInput,
  CcxtPrivateWriteInput,
  CcxtPublicCallInput,
  DescribeCcxtExchangeInput,
  ListCcxtExchangesInput,
} from "../../api/types.js";
import {
  accountHasCredentials,
  listAccountSummaries,
  resolveExchangeIdFromAccount,
} from "../../ccxt/accounts.js";
import {
  PRIVATE_READ_METHODS,
  PRIVATE_WRITE_METHODS,
  describeExchangeCapabilities,
  hasAnyPrivateMethod,
} from "../../ccxt/capabilities.js";
import { classifyCcxtWriteRisk, isHighRiskCcxtMethod } from "../../ccxt/classification.js";
import {
  invokeCcxtPrivateRead,
  invokeCcxtPrivateWrite,
  invokeCcxtPublicCall,
} from "../../ccxt/invoke.js";
import { getCcxtRuntimeState } from "../../ccxt/runtime-state.js";
import { extractEstimatedUsd } from "../../policy/extract-usd.js";
import { formatToolErrorFromUnknown, formatToolResponse } from "../../utils/errors.js";
import { isPlainObject } from "../../utils/type-guards.js";
import { validateInput } from "../../utils/validation.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
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

interface ExchangeStaticMeta {
  id: string;
  name: string;
  countries?: string[];
  urls?: Record<string, string | Record<string, string>>;
  has: Record<string, boolean | "emulated" | undefined>;
  timeframes?: string[];
}

let exchangeMetaCache: ExchangeStaticMeta[] | undefined;

/**
 * Lazily builds metadata for all CCXT-supported exchanges (~100+).
 * The first call instantiates every exchange constructor to extract static
 * metadata (id, name, countries, has, timeframes). Subsequent calls use cache.
 * Expect a noticeable cold-start delay on first ccxt_list_exchanges invocation.
 */
function getExchangeMetaCache(): ExchangeStaticMeta[] {
  if (exchangeMetaCache) return exchangeMetaCache;

  exchangeMetaCache = ccxt.exchanges
    .map((exchangeId) => {
      const Ctor = (ccxt as unknown as Record<string, unknown>)[exchangeId];
      if (typeof Ctor !== "function") return null;

      try {
        const ex = new (
          Ctor as new () => {
            id: string;
            name?: string;
            countries?: string[];
            urls?: Record<string, string | Record<string, string>>;
            has?: Record<string, boolean | "emulated" | undefined>;
            timeframes?: Record<string, string>;
          }
        )();

        return {
          id: ex.id ?? exchangeId,
          name: ex.name ?? exchangeId,
          countries: Array.isArray(ex.countries) ? ex.countries : undefined,
          urls: isPlainObject(ex.urls)
            ? (ex.urls as Record<string, string | Record<string, string>>)
            : undefined,
          has: ex.has ?? {},
          timeframes: ex.timeframes ? Object.keys(ex.timeframes) : undefined,
        };
      } catch (e: unknown) {
        process.stderr.write(
          `[ccxt] Failed to instantiate exchange ${exchangeId}: ${e instanceof Error ? e.message : String(e)}\n`
        );
        return null;
      }
    })
    .filter((meta): meta is NonNullable<typeof meta> => meta !== null);

  return exchangeMetaCache;
}

function listExchanges(input: {
  configuredOnly?: boolean;
  hasAuth?: boolean;
  marketType?: "spot" | "margin" | "future" | "swap" | "option";
}) {
  const { registry } = getCcxtRuntimeState();

  return getExchangeMetaCache()
    .filter((meta) => {
      if (input.marketType && !meta.has[input.marketType]) return false;

      const hasAuth = registry.accounts.some(
        (a) => a.exchangeId === meta.id && accountHasCredentials(a)
      );

      if (input.configuredOnly && !hasAuth) return false;
      if (input.hasAuth === true && !hasAuth) return false;
      if (input.hasAuth === false && hasAuth) return false;

      return true;
    })
    .map((meta) => {
      const configuredAccounts = registry.accounts
        .filter((a) => a.exchangeId === meta.id)
        .map((a) => a.name);

      const hasCredentialedAccount = registry.accounts.some(
        (a) => a.exchangeId === meta.id && accountHasCredentials(a)
      );
      // M3 follow-up: gate supportsPrivate on BOTH a credentialed account AND
      // the exchange exposing at least one private method (read or write).
      // Credentials alone don't make the private surface usable — agents that
      // pick the first supportsPrivate=true exchange would otherwise hit
      // "method not supported" at the CCXT layer.
      const supportsPrivate =
        hasCredentialedAccount &&
        (hasAnyPrivateMethod(meta.has, PRIVATE_READ_METHODS) ||
          hasAnyPrivateMethod(meta.has, PRIVATE_WRITE_METHODS));

      return {
        exchangeId: meta.id,
        name: meta.name,
        countries: meta.countries,
        urls: meta.urls,
        configuredAccounts,
        supportsPublic: true,
        supportsPrivate,
        timeframes: meta.timeframes,
      };
    });
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
      .map((account) => ({
        name: account.name,
        hasCredentials: accountHasCredentials(account),
      }));
    return describeExchangeCapabilities(exchange, configuredAccounts);
  }

  const exchange = await factory.getPublicExchange({
    exchangeId: input.exchange ?? "",
    loadMarkets: input.loadMarkets,
    reloadMarkets: input.reloadMarkets,
  });
  const configuredAccounts = registry.accounts
    .filter((account) => account.exchangeId === exchange.id)
    .map((account) => ({
      name: account.name,
      hasCredentials: accountHasCredentials(account),
    }));
  return describeExchangeCapabilities(exchange, configuredAccounts);
}

function listAccounts() {
  const { registry } = getCcxtRuntimeState();
  return listAccountSummaries(registry);
}

function checkHighRiskGuards(method: string): CallToolResult | null {
  if (!isHighRiskCcxtMethod(method)) return null;

  if (!confirmationQueue.enabled) {
    return formatToolErrorFromUnknown(
      "CCXT_PRIVATE_WRITE_ERROR",
      new Error(
        `Method '${method}' requires confirmation to be enabled. ` +
          `Set CONFIRM_WRITES=true or omit it (enabled by default) to use ${method}.`
      )
    );
  }

  const { registry } = getCcxtRuntimeState();
  if (registry.insecurePermissions) {
    const configHint = registry.configPath
      ? `Run: chmod 600 ${registry.configPath}`
      : "Fix file permissions on your CCXT config file";
    return formatToolErrorFromUnknown(
      "CCXT_PRIVATE_WRITE_ERROR",
      new Error(
        `Method '${method}' is blocked because CCXT config file has insecure permissions. ${configHint}`
      )
    );
  }

  return null;
}

async function executeCcxtPrivateWrite(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const validation = validateInput(ccxtPrivateWriteSchema, params);
    if (!validation.success) return validation.error;
    const input = validation.data as CcxtPrivateWriteInput;
    const blocked = checkHighRiskGuards(input.method);
    if (blocked) return blocked;
    const result = await invokeCcxtPrivateWrite(input, getCcxtRuntimeState().factory);
    return formatToolResponse(result);
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("CCXT_PRIVATE_WRITE_ERROR", error);
  }
}

/**
 * CCXT private writes use exchange API keys, not an on-chain wallet —
 * so we call confirmationQueue.enqueue() directly rather than going
 * through executeWrite(), which gates on walletState.mode === "read-only".
 * The wallet read-only guard is irrelevant for off-chain exchange operations.
 */
async function handleCcxtPrivateWrite(params: Record<string, unknown>): Promise<CallToolResult> {
  const validation = validateInput(ccxtPrivateWriteSchema, params);
  if (!validation.success) return validation.error;

  const writeData = validation.data as CcxtPrivateWriteInput;
  const blocked = checkHighRiskGuards(writeData.method);
  if (blocked) return blocked;

  const estimatedUsd = await extractEstimatedUsd(writeData as unknown as Record<string, unknown>);

  const policyParams = {
    method: writeData.method,
    account: writeData.account,
    ...(estimatedUsd !== null && estimatedUsd > 0 ? { estimatedUsd } : {}),
  };

  // The executor is a closure over writeData; raw CCXT args never touch
  // pending-ops.json. If the process restarts, loadQueue() drops any
  // persisted ccxt_private_write entry because no executor is registered
  // for that type.
  const { queued, id, summary } = confirmationQueue.enqueue(
    "ccxt_private_write",
    `CCXT ${writeData.method} on account ${writeData.account}`,
    policyParams as unknown as Record<string, unknown>,
    async () => executeCcxtPrivateWrite(writeData as unknown as Record<string, unknown>),
    undefined,
    classifyCcxtWriteRisk(writeData.method)
  );

  if (queued) {
    return formatToolResponse({ status: "pending_confirmation", id, summary });
  }

  return executeCcxtPrivateWrite(writeData as unknown as Record<string, unknown>);
}

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
      inputSchema: zodToJsonSchema(ccxtListAccountsSchema) as Record<string, unknown>,
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
        async (input: CcxtPublicCallInput) =>
          invokeCcxtPublicCall(input, getCcxtRuntimeState().factory),
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
      handler: handleCcxtPrivateWrite,
      riskLevel: (args: Record<string, unknown>) => {
        const method = args.method;
        if (typeof method !== "string" || method.length === 0) {
          return "financial";
        }
        return classifyCcxtWriteRisk(method);
      },
      annotations: CCXT_WRITE_ANNOTATIONS,
    },
  ];
}
