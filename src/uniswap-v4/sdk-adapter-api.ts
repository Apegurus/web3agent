import type { UniswapV4PoolKey } from "../api/types.js";
import {
  toBigint,
  toPercent,
  toPool,
  toPosition,
  toSdkCurrency,
} from "./sdk-adapter-conversion.js";
import {
  type SdkPermit2Input,
  type SdkPoolState,
  type SdkPositionInput,
  assertAddress,
  assertPoolKey,
  assertPositionTicks,
} from "./sdk-adapter-inputs.js";
import type * as Adapter from "./sdk-adapter-types.js";
import { Pool, Position, Price, priceToClosestTick, tickToPrice } from "./sdk-adapter.js";

export {
  buildPositionManagerCalldataWithNftPermitSignature,
  buildPositionManagerCalldata,
  getPositionManagerPermitData,
} from "./sdk-adapter-position-manager.js";

export type * from "./sdk-adapter-types.js";

function toAmounts(amounts: {
  readonly amount0: { toString(): string };
  readonly amount1: { toString(): string };
}): Adapter.SdkAmounts {
  return { amount0: toBigint(amounts.amount0), amount1: toBigint(amounts.amount1) };
}

export function getPoolIdentity(poolKey: UniswapV4PoolKey): Adapter.SdkPoolIdentity {
  assertPoolKey(poolKey);
  const currency0 = toSdkCurrency(poolKey.currency0);
  const currency1 = toSdkCurrency(poolKey.currency1);
  return {
    poolKey,
    poolId: Pool.getPoolId(currency0, currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks),
  };
}

export function validatePositionTicks(
  input: Pick<SdkPositionInput, "poolKey" | "tickLower" | "tickUpper">
): void {
  assertPoolKey(input.poolKey);
  assertPositionTicks(input);
}

export function getPositionAmounts(input: SdkPositionInput): Adapter.SdkPositionAmounts {
  const position = toPosition(input);
  const slippage = toPercent(input.slippageBps);
  return {
    current: {
      amount0: toBigint(position.amount0.quotient),
      amount1: toBigint(position.amount1.quotient),
    },
    mintMaximum: toAmounts(position.mintAmountsWithSlippage(slippage)),
    burnMinimum: toAmounts(position.burnAmountsWithSlippage(slippage)),
  };
}

export function getTickPrice(input: {
  readonly poolKey: UniswapV4PoolKey;
  readonly tick: number;
}): Adapter.SdkRational {
  assertPoolKey(input.poolKey);
  const price = tickToPrice(
    toSdkCurrency(input.poolKey.currency0),
    toSdkCurrency(input.poolKey.currency1),
    input.tick
  );
  return { denominator: toBigint(price.denominator), numerator: toBigint(price.numerator) };
}

export function getPriceTick(input: {
  readonly poolKey: UniswapV4PoolKey;
  readonly price: Adapter.SdkRational;
}): number {
  assertPoolKey(input.poolKey);
  return priceToClosestTick(
    new Price(
      toSdkCurrency(input.poolKey.currency0),
      toSdkCurrency(input.poolKey.currency1),
      input.price.denominator.toString(),
      input.price.numerator.toString()
    )
  );
}

export function getLiquidityForAmounts(
  input: SdkPoolState & {
    readonly amount0: bigint;
    readonly amount1: bigint;
    readonly tickLower: number;
    readonly tickUpper: number;
  }
): Adapter.SdkAmountsAndLiquidity {
  assertPoolKey(input.poolKey);
  assertPositionTicks(input);
  const position = Position.fromAmounts({
    amount0: input.amount0.toString(),
    amount1: input.amount1.toString(),
    pool: toPool(input),
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    useFullPrecision: true,
  });
  return { ...toAmounts(position.mintAmounts), liquidity: toBigint(position.liquidity) };
}

export function buildPermit2Batch(input: SdkPermit2Input): Adapter.SdkPermit2Batch {
  assertAddress(input.spender, "spender");
  const permit = toPosition(input).permitBatchData(
    toPercent(input.slippageBps),
    input.spender,
    input.nonce.toString(),
    input.deadline.toString()
  );
  return {
    spender: permit.spender,
    sigDeadline: toBigint(permit.sigDeadline),
    details: permit.details.map((detail) => ({
      token: detail.token,
      amount: toBigint(detail.amount),
      expiration: toBigint(detail.expiration),
      nonce: toBigint(detail.nonce),
    })),
  };
}
