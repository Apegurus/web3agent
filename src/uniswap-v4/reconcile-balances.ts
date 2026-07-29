import { ERC20_BALANCE_ABI, getPublicClientCached } from "../evm/services.js";
import type { UniswapV4PersistedWritePlan } from "../tools/uniswap-v4/write-schemas.js";
import type { UniswapV4ObservedDelta } from "./reconcile.js";

export async function observeUniswapV4TokenBalances(
  plan: UniswapV4PersistedWritePlan,
  receiptBlockNumber: string
): Promise<
  readonly {
    readonly currency: "currency0" | "currency1";
    readonly value: UniswapV4ObservedDelta;
  }[]
> {
  return Promise.all(
    [plan.operation.poolKey.currency0, plan.operation.poolKey.currency1].map(
      async (currency, index) => ({
        currency: index === 0 ? "currency0" : "currency1",
        value: await observeCurrencyDelta(plan, currency, receiptBlockNumber),
      })
    )
  );
}

async function observeCurrencyDelta(
  plan: UniswapV4PersistedWritePlan,
  currency: UniswapV4PersistedWritePlan["operation"]["poolKey"]["currency0"],
  receiptBlockNumber: string
): Promise<UniswapV4ObservedDelta> {
  if (currency.kind === "native") {
    return { reason: "native balance deltas include gas paid", status: "unavailable" };
  }
  try {
    const client = getPublicClientCached(plan.operation.chainId);
    const [before, after] = await Promise.all([
      client.readContract({
        abi: ERC20_BALANCE_ABI,
        address: currency.address,
        args: [plan.account],
        blockNumber: BigInt(plan.sourceBlock.blockNumber),
        functionName: "balanceOf",
      }),
      client.readContract({
        abi: ERC20_BALANCE_ABI,
        address: currency.address,
        args: [plan.account],
        blockNumber: BigInt(receiptBlockNumber),
        functionName: "balanceOf",
      }),
    ]);
    if (typeof before !== "bigint" || typeof after !== "bigint") {
      return { reason: "token balance reader returned a non-integer value", status: "unavailable" };
    }
    return { status: "available", value: (after - before).toString() };
  } catch (error: unknown) {
    return {
      reason: error instanceof Error ? error.message : "token balance read failed",
      status: "unavailable",
    };
  }
}
