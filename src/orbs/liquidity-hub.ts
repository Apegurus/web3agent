import { constructSDK } from "@orbs-network/liquidity-hub-sdk";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";

export type { Quote };

type LiquidityHubSDK = ReturnType<typeof constructSDK>;

const sdkCache = new Map<number, LiquidityHubSDK>();

export function getSdk(chainId: number): LiquidityHubSDK {
  let sdk = sdkCache.get(chainId);
  if (!sdk) {
    sdk = constructSDK({ partner: "web3agent", chainId });
    sdkCache.set(chainId, sdk);
  }
  return sdk;
}

export interface QuoteRequest {
  fromToken: string;
  toToken: string;
  inAmount: string;
  slippage?: number;
  account?: string;
}

export interface QuoteResult {
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  minAmountOut: string;
  exchange: string;
}

export async function getQuote(chainId: number, request: QuoteRequest): Promise<QuoteResult> {
  const sdk = getSdk(chainId);
  const quote = await sdk.getQuote({
    fromToken: request.fromToken,
    toToken: request.toToken,
    inAmount: request.inAmount,
    slippage: request.slippage ?? 0.5,
    account: request.account,
  });

  if (quote.error) {
    throw new Error(`Liquidity Hub quote error: ${quote.error}`);
  }

  return {
    inToken: quote.inToken,
    outToken: quote.outToken,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    minAmountOut: quote.minAmountOut,
    exchange: quote.exchange,
  };
}

export async function executeSwap(
  chainId: number,
  quote: Quote,
  signature: string
): Promise<string> {
  const sdk = getSdk(chainId);
  return sdk.swap(quote, signature);
}
