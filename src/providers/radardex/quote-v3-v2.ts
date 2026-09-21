import { type Address, encodePacked } from "viem";
import { RADARDEX_ABIS, RADARDEX_ARC } from "./manifest.js";
import {
  type ProbeContext,
  netAfterFee,
  readLiveFee,
  requireBytecode,
  v2QuoteSchema,
  v3QuoteSchema,
} from "./quote-core.js";
import { encodeV3Path } from "./quote-utils.js";
import type { RadarRoute } from "./schemas.js";

type BestV3 = { readonly fee: number; readonly output: bigint; readonly gasEstimate: bigint };

type BestV3Input = {
  readonly context: ProbeContext;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly amountIn: bigint;
  readonly quoter?: Address;
};

async function bestV3Single(input: BestV3Input): Promise<BestV3> {
  const quoter = input.quoter ?? RADARDEX_ARC.quoters.v3;
  const settled = await Promise.allSettled(
    RADARDEX_ARC.feeTiers.map(async (fee) => {
      const raw = await input.context.client.readContract({
        address: quoter,
        abi: RADARDEX_ABIS.v3Quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: input.tokenIn,
            tokenOut: input.tokenOut,
            amountIn: input.amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const [output, , , gasEstimate] = v3QuoteSchema.parse(raw);
      return { fee, output, gasEstimate };
    })
  );
  const quotes = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const best = quotes.sort((left, right) => (left.output > right.output ? -1 : 1))[0];
  if (!best) throw new Error("No V3 fee tier quoted");
  return best;
}

export async function probeV3Direct(context: ProbeContext): Promise<RadarRoute> {
  const venue = "v3:direct";
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v3Fee);
  await requireBytecode(context.client, venue, RADARDEX_ARC.routers.v3);
  const netInput = netAfterFee(context.grossInput, feeBps);
  const best = await bestV3Single({
    context,
    tokenIn: context.fromToken,
    tokenOut: context.toToken,
    amountIn: netInput,
  });
  return {
    id: `v3:${best.fee}`,
    family: "v3_direct",
    label: "Uniswap V3",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput: best.output,
    spender: RADARDEX_ARC.routers.v3Fee,
    feeBps,
    executable: true,
    path: [context.fromToken, context.toToken],
    gasEstimate: best.gasEstimate,
    execution: { kind: "v3_direct", poolFee: best.fee },
  };
}

export async function probeV3Multihop(context: ProbeContext, hub: Address): Promise<RadarRoute> {
  const venue = `v3:multihop:${hub.toLowerCase()}`;
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v3MultihopFee);
  const netInput = netAfterFee(context.grossInput, feeBps);
  const first = await bestV3Single({
    context,
    tokenIn: context.fromToken,
    tokenOut: hub,
    amountIn: netInput,
  });
  const second = await bestV3Single({
    context,
    tokenIn: hub,
    tokenOut: context.toToken,
    amountIn: first.output,
  });
  const encodedPath = encodeV3Path([
    { token: context.fromToken, fee: first.fee },
    { token: hub, fee: second.fee },
    { token: context.toToken },
  ]);
  const raw = await context.client.readContract({
    address: RADARDEX_ARC.quoters.v3,
    abi: RADARDEX_ABIS.v3Quoter,
    functionName: "quoteExactInput",
    args: [encodedPath, netInput],
  });
  const [output, , , gasEstimate] = v3QuoteSchema.parse(raw);
  return {
    id: `v3-multihop:${hub.toLowerCase()}:${first.fee}:${second.fee}`,
    family: "v3_multihop",
    label: "Uniswap V3 multihop",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput: output,
    spender: RADARDEX_ARC.routers.v3MultihopFee,
    feeBps,
    executable: true,
    path: [context.fromToken, hub, context.toToken],
    gasEstimate,
    execution: { kind: "v3_multihop", encodedPath },
  };
}

export async function probeV2(
  context: ProbeContext,
  venueName: string,
  router: Address
): Promise<RadarRoute> {
  const venue = `v2:${venueName}`;
  const feeBps = await readLiveFee(context.client, venue, RADARDEX_ARC.routers.v2Fee);
  await requireBytecode(context.client, venue, router);
  const netInput = netAfterFee(context.grossInput, feeBps);
  const raw = await context.client.readContract({
    address: router,
    abi: RADARDEX_ABIS.v2Router,
    functionName: "getAmountsOut",
    args: [netInput, [context.fromToken, context.toToken]],
  });
  const amounts = v2QuoteSchema.parse(raw);
  const output = amounts.at(-1);
  if (!output || output <= 0n) throw new Error("V2 quote returned no output");
  return {
    id: `${venue}:${router.toLowerCase()}`,
    family: "v2",
    label: venueName,
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput,
    expectedOutput: output,
    spender: RADARDEX_ARC.routers.v2Fee,
    feeBps,
    executable: true,
    path: [context.fromToken, context.toToken],
    execution: { kind: "v2", router },
  };
}

export async function probeSynthra(context: ProbeContext, feeTier: number): Promise<RadarRoute> {
  const venue = `synthra:${feeTier}`;
  await requireBytecode(context.client, venue, RADARDEX_ARC.routers.synthra);
  const raw = await context.client.readContract({
    address: RADARDEX_ARC.quoters.synthra,
    abi: RADARDEX_ABIS.v3Quoter,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: context.fromToken,
        tokenOut: context.toToken,
        amountIn: context.grossInput,
        fee: feeTier,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const [output, , , gasEstimate] = v3QuoteSchema.parse(raw);
  const encodedPath = encodePacked(
    ["address", "uint24", "address"],
    [context.fromToken, feeTier, context.toToken]
  );
  return {
    id: venue,
    family: "synthra",
    label: "Synthra V3",
    fromToken: context.fromToken,
    toToken: context.toToken,
    grossInput: context.grossInput,
    netInput: context.grossInput,
    expectedOutput: output,
    spender: RADARDEX_ARC.routers.synthra,
    feeBps: 0,
    executable: true,
    path: [context.fromToken, context.toToken],
    gasEstimate,
    execution: { kind: "synthra", poolFee: feeTier, encodedPath },
  };
}
