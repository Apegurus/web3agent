import type { Address } from "viem";
export { getRadarDexRouteHealth } from "./health.js";
import { RADARDEX_ARC } from "./manifest.js";
import { type ProbeContext, type RadarReadClient, errorMessage } from "./quote-core.js";
import { rankRoutes } from "./quote-utils.js";
import { probeSynthra, probeV2, probeV3Direct, probeV3Multihop } from "./quote-v3-v2.js";
import { probeV4Direct, probeV4Multihop, probeV4Native } from "./quote-v4.js";
import {
  type QuoteRequest,
  type RadarPoolCandidate,
  type RadarRoute,
  type RouteHealth,
  quoteRequestSchema,
} from "./schemas.js";

export { encodeV3Path, rankRoutes } from "./quote-utils.js";

export type RadarQuoteMetadata = {
  readonly v4Pools: readonly RadarPoolCandidate[];
  readonly synthraFeeTiers: readonly number[];
  readonly hubs: readonly Address[];
};

export type RadarQuoteDependencies = {
  readonly client: RadarReadClient;
  readonly metadata: RadarQuoteMetadata;
};

export type RadarQuoteResult = {
  readonly request: QuoteRequest;
  readonly routes: readonly RadarRoute[];
  readonly best?: RadarRoute;
  readonly health: readonly RouteHealth[];
};

type NamedProbe = {
  readonly venue: string;
  readonly run: () => Promise<RadarRoute>;
};

function directProbes(
  context: ProbeContext,
  dependencies: RadarQuoteDependencies
): readonly NamedProbe[] {
  return [
    { venue: "v3:direct", run: () => probeV3Direct(context) },
    {
      venue: "v2:dyor",
      run: () => probeV2(context, "DYORswap", RADARDEX_ARC.v2Routers.dyor),
    },
    {
      venue: "v2:warp",
      run: () => probeV2(context, "WarpDex", RADARDEX_ARC.v2Routers.warp),
    },
    { venue: "v4:direct", run: () => probeV4Direct(context, dependencies.metadata.v4Pools) },
    { venue: "v4:native", run: () => probeV4Native(context, dependencies.metadata.v4Pools) },
    ...dependencies.metadata.synthraFeeTiers.map((fee) => ({
      venue: `synthra:${fee}`,
      run: () => probeSynthra(context, fee),
    })),
  ];
}

function multihopProbes(
  context: ProbeContext,
  dependencies: RadarQuoteDependencies
): readonly NamedProbe[] {
  return dependencies.metadata.hubs
    .filter(
      (hub) =>
        hub.toLowerCase() !== context.fromToken.toLowerCase() &&
        hub.toLowerCase() !== context.toToken.toLowerCase()
    )
    .flatMap((hub) => [
      { venue: `v3:multihop:${hub.toLowerCase()}`, run: () => probeV3Multihop(context, hub) },
      {
        venue: `v4:multihop:${hub.toLowerCase()}`,
        run: () => probeV4Multihop(context, dependencies.metadata.v4Pools, hub),
      },
    ]);
}

export async function quoteRadarDex(
  input: unknown,
  dependencies: RadarQuoteDependencies
): Promise<RadarQuoteResult> {
  const request = quoteRequestSchema.parse(input);
  const context: ProbeContext = {
    client: dependencies.client,
    fromToken: request.fromToken,
    toToken: request.toToken,
    grossInput: BigInt(request.fromAmount),
  };
  const probes = [...directProbes(context, dependencies), ...multihopProbes(context, dependencies)];
  const settled = await Promise.allSettled(probes.map(({ run }) => run()));
  const routes: RadarRoute[] = [];
  const health: RouteHealth[] = [];
  settled.forEach((result, index) => {
    const probe = probes[index];
    if (!probe) return;
    if (result.status === "fulfilled") {
      routes.push(result.value);
      health.push({ venue: probe.venue, available: true });
      return;
    }
    health.push({ venue: probe.venue, available: false, reason: errorMessage(result.reason) });
  });
  const ranked = rankRoutes(routes);
  const best = ranked[0];
  return { request, routes: ranked, ...(best ? { best } : {}), health };
}
