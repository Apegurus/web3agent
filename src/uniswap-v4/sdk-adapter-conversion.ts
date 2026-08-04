import type { UniswapV4Currency } from "../api/types.js";
import type { SdkPoolState, SdkPositionInput } from "./sdk-adapter-inputs.js";
import { assertPositionInput } from "./sdk-adapter-inputs.js";
import { Ether, Percent, Pool, Position, Token } from "./sdk-adapter.js";

export function toBigint(value: { readonly toString: () => string }): bigint {
  return BigInt(value.toString());
}

export function toPercent(bps: number): Percent {
  return new Percent(bps.toString(), "10000");
}

export function toSdkCurrency(currency: UniswapV4Currency): Ether | Token {
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

export function toPool(state: SdkPoolState): Pool {
  const { poolKey } = state;
  return new Pool(
    toSdkCurrency(poolKey.currency0),
    toSdkCurrency(poolKey.currency1),
    poolKey.fee,
    poolKey.tickSpacing,
    poolKey.hooks,
    state.sqrtPriceX96.toString(),
    state.liquidity.toString(),
    state.tickCurrent,
    []
  );
}

export function toPosition(input: SdkPositionInput): Position {
  assertPositionInput(input);
  return new Position({
    pool: toPool(input),
    liquidity: input.liquidity.toString(),
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
  });
}
