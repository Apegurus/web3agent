import type { UniswapV4Currency, UniswapV4PoolKey } from "../api/types.js";
import { Ether, Price, Token, priceToClosestTick } from "./sdk-adapter.js";

const Q192 = 2n ** 192n;

export function getInitializationTick(input: {
  readonly poolKey: UniswapV4PoolKey;
  readonly sqrtPriceX96: bigint;
}): number {
  const price = new Price(
    toSdkCurrency(input.poolKey.currency0),
    toSdkCurrency(input.poolKey.currency1),
    Q192.toString(),
    (input.sqrtPriceX96 * input.sqrtPriceX96).toString()
  );
  return priceToClosestTick(price);
}

function toSdkCurrency(currency: UniswapV4Currency): Ether | Token {
  if (currency.kind === "native") {
    return Ether.onChain(currency.chainId);
  }
  return new Token(
    currency.chainId,
    currency.address,
    currency.decimals,
    currency.symbol,
    currency.name
  );
}
