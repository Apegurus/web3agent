import type {
  CcxtInvocationResult,
  CcxtPrivateReadInput,
  CcxtPrivateWriteInput,
  CcxtPublicCallInput,
} from "../api/types.js";
import { isMethodAllowedForTool } from "./classification.js";
import type { CcxtExchangeFactory } from "./factory.js";
import type { CcxtExchangeLike } from "./types.js";

/** Prevents circular call when the invoked method IS loadMarkets. */
function resolveLoadMarkets(method: string, loadMarkets: boolean | undefined): boolean | undefined {
  return method === "loadMarkets" ? false : loadMarkets;
}

function buildMethodArgs(
  args: unknown[] | undefined,
  params: Record<string, unknown> | undefined
): unknown[] {
  if (params === undefined) {
    return [...(args ?? [])];
  }
  return [...(args ?? []), params];
}

async function callExchangeMethod(
  exchange: CcxtExchangeLike,
  method: string,
  args: unknown[] | undefined,
  params: Record<string, unknown> | undefined
): Promise<unknown> {
  const candidate = exchange[method];
  if (typeof candidate !== "function") {
    throw new Error(`Exchange ${exchange.id} does not implement method ${method}`);
  }

  return await candidate.apply(exchange, buildMethodArgs(args, params));
}

function assertAllowedMethod(
  toolName: "ccxt_public_call" | "ccxt_private_read" | "ccxt_private_write",
  method: string
): void {
  if (!isMethodAllowedForTool(toolName, method)) {
    throw new Error(`Method ${method} is not allowed for ${toolName}`);
  }
}

export async function invokeCcxtPublicCall(
  input: CcxtPublicCallInput,
  factory: CcxtExchangeFactory
): Promise<CcxtInvocationResult> {
  assertAllowedMethod("ccxt_public_call", input.method);

  const exchange = await factory.getPublicExchange({
    exchangeId: input.exchange,
    marketType: input.marketType,
    sandbox: input.sandbox,
    loadMarkets: resolveLoadMarkets(input.method, input.loadMarkets),
    reloadMarkets: input.reloadMarkets,
  });
  const result = await callExchangeMethod(exchange, input.method, input.args, input.params);

  return {
    exchangeId: exchange.id,
    method: input.method,
    classification: "public",
    result,
  };
}

export async function invokeCcxtPrivateRead(
  input: CcxtPrivateReadInput,
  factory: CcxtExchangeFactory
): Promise<CcxtInvocationResult> {
  assertAllowedMethod("ccxt_private_read", input.method);

  const exchange = await factory.getPrivateExchange({
    accountName: input.account,
    loadMarkets: resolveLoadMarkets(input.method, input.loadMarkets),
    reloadMarkets: input.reloadMarkets,
  });
  const result = await callExchangeMethod(exchange, input.method, input.args, input.params);

  return {
    account: input.account,
    exchangeId: exchange.id,
    method: input.method,
    classification: "private_read",
    result,
  };
}

export async function invokeCcxtPrivateWrite(
  input: CcxtPrivateWriteInput,
  factory: CcxtExchangeFactory
): Promise<CcxtInvocationResult> {
  assertAllowedMethod("ccxt_private_write", input.method);

  const exchange = await factory.getPrivateExchange({
    accountName: input.account,
    loadMarkets: resolveLoadMarkets(input.method, input.loadMarkets),
    reloadMarkets: input.reloadMarkets,
  });
  const result = await callExchangeMethod(exchange, input.method, input.args, input.params);

  return {
    account: input.account,
    exchangeId: exchange.id,
    method: input.method,
    classification: "private_write",
    result,
  };
}
