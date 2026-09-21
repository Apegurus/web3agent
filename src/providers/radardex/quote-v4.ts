import type { Address } from "viem";
import { RADARDEX_ABIS, RADARDEX_ARC } from "./manifest.js";
import {
  type ProbeContext,
  netAfterFee,
  readLiveFee,
  requireBytecode,
  v4QuoteSchema,
} from "./quote-core.js";
import { orderedV4Key } from "./quote-utils.js";
import type { RadarPoolCandidate, RadarRoute, V4Key } from "./schemas.js";

type V4Quote = {
  readonly output: bigint;
  readonly gasEstimate: bigint;
  readonly key: V4Key;
  readonly zeroForOne: boolean;
};

type V4PoolQuoteInput = {
  readonly context: ProbeContext;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly amountIn: bigint;
  readonly pool: RadarPoolCandidate;
};

async function quoteV4Pool(input: V4PoolQuoteInput): Promise<V4Quote> {
  const ordered = orderedV4Key({
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    fee: input.pool.feeTier,
    tickSpacing: input.pool.tickSpacing,
    hooks: input.pool.hooks,
  });
  const raw = await input.context.client.readContract({
    address: RADARDEX_ARC.quoters.v4,
    abi: RADARDEX_ABIS.v4Quoter,
    functionName: "quoteExactInputSingle",
    args: [[ordered.key, ordered.zeroForOne, input.amountIn, "0x"]],
  });
  const [output, gasEstimate] = v4QuoteSchema.parse(raw);
  return { output, gasEstimate, ...ordered };
}

function matchesPair(pool: RadarPoolCandidate, tokenA: Address, tokenB: Address): boolean {
  const pair = new Set([pool.tokenA.toLowerCase(), pool.tokenB.toLowerCase()]);
  return pair.has(tokenA.toLowerCase()) && pair.has(tokenB.toLowerCase());
}

export async function probeV4Direct(
  context: ProbeContext,
  pools: readonly RadarPoolCandidate[]
): Promise<RadarRoute> {
  const venue = "v4:direct";
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v4Fee);
  await requireBytecode(context.client, venue, RADARDEX_ARC.routers.v4);
  const netInput = netAfterFee(context.grossInput, feeBps);
  const candidates = pools.filter(
    (pool) => !pool.nativeQuote && matchesPair(pool, context.fromToken, context.toToken)
  );
  const settled = await Promise.allSettled(
    candidates.map((pool) =>
      quoteV4Pool({
        context,
        tokenIn: context.fromToken,
        tokenOut: context.toToken,
        amountIn: netInput,
        pool,
      })
    )
  );
  const quotes = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const best = quotes.sort((left, right) => (left.output > right.output ? -1 : 1))[0];
  if (!best) throw new Error("No validated V4 direct pool quoted");
  return {
    id: `v4:${best.key.fee}:${best.key.tickSpacing}:${best.key.hooks.toLowerCase()}`,
    family: "v4_direct",
    label: "Uniswap V4",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput: best.output,
    spender: RADARDEX_ARC.routers.v4Fee,
    feeBps,
    executable: true,
    path: [context.fromToken, context.toToken],
    gasEstimate: best.gasEstimate,
    execution: {
      kind: "v4_direct",
      poolFee: best.key.fee,
      tickSpacing: best.key.tickSpacing,
      hooks: best.key.hooks,
    },
  };
}

export async function probeV4Native(
  context: ProbeContext,
  pools: readonly RadarPoolCandidate[]
): Promise<RadarRoute> {
  const fromUsdc = context.fromToken.toLowerCase() === RADARDEX_ARC.usdc.toLowerCase();
  const toUsdc = context.toToken.toLowerCase() === RADARDEX_ARC.usdc.toLowerCase();
  if (fromUsdc === toUsdc) throw new Error("Native V4 requires one USDC side");
  const venue = "v4:native";
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v4NativeFee);
  const token = fromUsdc ? context.toToken : context.fromToken;
  const pool = pools.find(
    (candidate) =>
      candidate.nativeQuote &&
      [candidate.tokenA.toLowerCase(), candidate.tokenB.toLowerCase()].includes(
        token.toLowerCase()
      ) &&
      [candidate.tokenA.toLowerCase(), candidate.tokenB.toLowerCase()].includes(
        RADARDEX_ARC.zeroAddress.toLowerCase()
      )
  );
  if (!pool) throw new Error("No validated native V4 pool");
  const netInput = netAfterFee(context.grossInput, feeBps);
  const quotedInput = fromUsdc ? netInput * 1_000_000_000_000n : netInput;
  const quote = await quoteV4Pool({
    context,
    tokenIn: fromUsdc ? RADARDEX_ARC.zeroAddress : token,
    tokenOut: fromUsdc ? token : RADARDEX_ARC.zeroAddress,
    amountIn: quotedInput,
    pool,
  });
  const expectedOutput = fromUsdc ? quote.output : quote.output / 1_000_000_000_000n;
  return {
    id: `v4-native:${fromUsdc ? "buy" : "sell"}:${pool.feeTier}`,
    family: "v4_native",
    label: "Uniswap V4 native",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput,
    spender: RADARDEX_ARC.routers.v4NativeFee,
    feeBps,
    executable: true,
    path: [context.fromToken, context.toToken],
    gasEstimate: quote.gasEstimate,
    execution: {
      kind: "v4_native",
      direction: fromUsdc ? "native_to_token" : "token_to_native",
      token,
      poolFee: pool.feeTier,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
      nativeValue: fromUsdc ? context.grossInput * 1_000_000_000_000n : 0n,
    },
  };
}

export async function probeV4Multihop(
  context: ProbeContext,
  pools: readonly RadarPoolCandidate[],
  hub: Address
): Promise<RadarRoute> {
  const firstPool = pools.find(
    (pool) => !pool.nativeQuote && matchesPair(pool, context.fromToken, hub)
  );
  const secondPool = pools.find(
    (pool) => !pool.nativeQuote && matchesPair(pool, hub, context.toToken)
  );
  if (!firstPool || !secondPool) throw new Error("V4 multihop pool metadata is incomplete");
  const venue = `v4:multihop:${hub.toLowerCase()}`;
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v4MultihopFee);
  const netInput = netAfterFee(context.grossInput, feeBps);
  const first = await quoteV4Pool({
    context,
    tokenIn: context.fromToken,
    tokenOut: hub,
    amountIn: netInput,
    pool: firstPool,
  });
  const second = await quoteV4Pool({
    context,
    tokenIn: hub,
    tokenOut: context.toToken,
    amountIn: first.output,
    pool: secondPool,
  });
  return {
    id: `v4-multihop:${hub.toLowerCase()}:${first.key.fee}:${second.key.fee}`,
    family: "v4_multihop",
    label: "Uniswap V4 multihop",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput: second.output,
    spender: RADARDEX_ARC.routers.v4MultihopFee,
    feeBps,
    executable: true,
    path: [context.fromToken, hub, context.toToken],
    gasEstimate: first.gasEstimate + second.gasEstimate,
    execution: {
      kind: "v4_multihop",
      hub,
      key1: first.key,
      zeroForOne1: first.zeroForOne,
      key2: second.key,
      zeroForOne2: second.zeroForOne,
    },
  };
}
