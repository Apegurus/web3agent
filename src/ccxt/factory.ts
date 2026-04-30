import ccxt from "ccxt";
import { accountHasCredentials, getAccountByName } from "./accounts.js";
import type { CcxtAccountConfig, CcxtAccountRegistry, CcxtExchangeLike } from "./types.js";

export interface GetPublicExchangeOptions {
  exchangeId: string;
  marketType?: "spot" | "margin" | "future" | "swap" | "option";
  sandbox?: boolean;
  loadMarkets?: boolean;
  reloadMarkets?: boolean;
}

export interface GetPrivateExchangeOptions {
  accountName: string;
  loadMarkets?: boolean;
  reloadMarkets?: boolean;
}

type ExchangeConstructor = new (config?: Record<string, unknown>) => CcxtExchangeLike;

function getExchangeConstructor(exchangeId: string): ExchangeConstructor {
  const exchangeConstructor = (ccxt as unknown as Record<string, unknown>)[exchangeId];
  if (typeof exchangeConstructor !== "function") {
    throw new Error(`Unsupported CCXT exchange: ${exchangeId}`);
  }
  return exchangeConstructor as ExchangeConstructor;
}

function hasLoadedMarkets(exchange: CcxtExchangeLike): boolean {
  return Boolean(exchange.markets && Object.keys(exchange.markets).length > 0);
}

async function maybeLoadMarkets(
  exchange: CcxtExchangeLike,
  options: { loadMarkets?: boolean; reloadMarkets?: boolean }
): Promise<void> {
  if (options.loadMarkets === false) {
    return;
  }
  if (options.reloadMarkets) {
    await exchange.loadMarkets(true);
    return;
  }
  if (hasLoadedMarkets(exchange)) {
    return;
  }
  await exchange.loadMarkets();
}

function buildPrivateExchangeConfig(account: CcxtAccountConfig): Record<string, unknown> {
  return {
    apiKey: account.apiKey,
    secret: account.secret,
    password: account.password,
    uid: account.uid,
    privateKey: account.privateKey,
    walletAddress: account.walletAddress,
    enableRateLimit: account.enableRateLimit,
    timeout: account.timeout,
    headers: account.headers,
    options: {
      ...(account.options ?? {}),
      defaultType: account.defaultType ?? "spot",
    },
  };
}

export class CcxtExchangeFactory {
  private readonly publicInstances = new Map<string, CcxtExchangeLike>();
  private readonly privateInstances = new Map<string, CcxtExchangeLike>();

  constructor(private readonly registry: CcxtAccountRegistry) {}

  getConfiguredAccounts(exchangeId?: string): CcxtAccountConfig[] {
    return this.registry.accounts.filter((account) =>
      exchangeId ? account.exchangeId === exchangeId : true
    );
  }

  async getPublicExchange(options: GetPublicExchangeOptions): Promise<CcxtExchangeLike> {
    const marketType = options.marketType ?? "spot";
    const sandbox = options.sandbox ?? false;
    const cacheKey = `${options.exchangeId}:${marketType}:${sandbox}`;
    let exchange = this.publicInstances.get(cacheKey);

    if (!exchange) {
      const ExchangeConstructor = getExchangeConstructor(options.exchangeId);
      exchange = new ExchangeConstructor({
        options: {
          defaultType: marketType,
        },
      });
      if (sandbox && typeof exchange.setSandboxMode === "function") {
        exchange.setSandboxMode(true);
      }
      this.publicInstances.set(cacheKey, exchange);
    }

    await maybeLoadMarkets(exchange, options);
    return exchange;
  }

  async getPrivateExchange(options: GetPrivateExchangeOptions): Promise<CcxtExchangeLike> {
    let exchange = this.privateInstances.get(options.accountName);
    const account = getAccountByName(this.registry, options.accountName);
    if (!account) {
      throw new Error(`Unknown CCXT account: ${options.accountName}`);
    }
    if (!accountHasCredentials(account)) {
      throw new Error(`CCXT account '${options.accountName}' is missing CCXT credentials`);
    }

    if (!exchange) {
      const ExchangeConstructor = getExchangeConstructor(account.exchangeId);
      exchange = new ExchangeConstructor(buildPrivateExchangeConfig(account));
      if (account.sandbox && typeof exchange.setSandboxMode === "function") {
        exchange.setSandboxMode(true);
      }

      const sharedPublicExchange = this.findLoadedPublicExchange(
        account.exchangeId,
        account.defaultType ?? "spot",
        account.sandbox ?? false
      );
      if (
        sharedPublicExchange &&
        typeof exchange.setMarketsFromExchange === "function" &&
        hasLoadedMarkets(sharedPublicExchange)
      ) {
        exchange.setMarketsFromExchange(sharedPublicExchange);
      }

      this.privateInstances.set(options.accountName, exchange);
    }

    await maybeLoadMarkets(exchange, options);
    return exchange;
  }

  private findLoadedPublicExchange(
    exchangeId: string,
    marketType: string,
    sandbox: boolean
  ): CcxtExchangeLike | undefined {
    const cacheKey = `${exchangeId}:${marketType}:${sandbox}`;
    const exchange = this.publicInstances.get(cacheKey);
    if (exchange && hasLoadedMarkets(exchange)) {
      return exchange;
    }
    return undefined;
  }
}
