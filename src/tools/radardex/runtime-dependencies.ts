import { createPublicClient } from "viem";
import { getRequiredChain } from "../../chains/registry.js";
import { getTransportForChain } from "../../config/wallet-factory.js";
import {
  RADARDEX_ARC,
  RadarExecutionError,
  RadarMetadataClient,
  executeRadarDexSwap,
  getRadarDexRouteHealth,
  quoteRadarDex,
} from "../../providers/radardex/index.js";
import type {
  QuoteRequest,
  RadarExecutionResult,
  RadarPoolCandidate,
  RadarQuoteResult,
  RadarReadClient,
  RadarRouteHealthEntry,
} from "../../providers/radardex/index.js";
import { buildWriteContext, isWriteContext } from "../shared/write-context.js";
import type { RadarDexToolDependencies } from "./types.js";

function createRadarReadClient(): RadarReadClient {
  const publicClient = createPublicClient({
    chain: getRequiredChain(RADARDEX_ARC.chainId),
    transport: getTransportForChain(RADARDEX_ARC.chainId),
  });
  return {
    getBytecode: (request) => publicClient.getCode(request),
    readContract: (request) => publicClient.readContract(request),
  };
}

function uniquePools<
  T extends {
    readonly tokenA: string;
    readonly tokenB: string;
    readonly feeTier: number;
    readonly tickSpacing: number;
    readonly hooks: string;
  },
>(pools: readonly T[]): readonly T[] {
  const unique = new Map<string, T>();
  for (const pool of pools) {
    const key = `${pool.tokenA.toLowerCase()}:${pool.tokenB.toLowerCase()}:${pool.feeTier}:${pool.tickSpacing}:${pool.hooks.toLowerCase()}`;
    unique.set(key, pool);
  }
  return [...unique.values()];
}

type RadarDexQuoteServiceDependencies = {
  readonly metadataClient: {
    readonly listV4Pools: (
      tokenA: QuoteRequest["fromToken"],
      tokenB: QuoteRequest["toToken"]
    ) => Promise<readonly RadarPoolCandidate[]>;
  };
  readonly readClient: RadarReadClient;
  readonly quote: typeof quoteRadarDex;
};

export function createRadarDexQuoteService(
  dependencies: RadarDexQuoteServiceDependencies
): (input: QuoteRequest) => Promise<RadarQuoteResult> {
  return async (input) => {
    const pairs = [
      [input.fromToken, input.toToken],
      [input.fromToken, RADARDEX_ARC.usdc],
      [RADARDEX_ARC.usdc, input.toToken],
    ] as const;
    const poolResults = await Promise.allSettled(
      pairs
        .filter(([tokenA, tokenB]) => tokenA.toLowerCase() !== tokenB.toLowerCase())
        .map(([tokenA, tokenB]) => dependencies.metadataClient.listV4Pools(tokenA, tokenB))
    );
    const pools = poolResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    return dependencies.quote(input, {
      client: dependencies.readClient,
      metadata: {
        v4Pools: uniquePools(pools),
        synthraFeeTiers: RADARDEX_ARC.feeTiers,
        hubs: [RADARDEX_ARC.usdc],
      },
    });
  };
}

const metadataClient = new RadarMetadataClient();
const getQuote = (input: QuoteRequest): Promise<RadarQuoteResult> =>
  createRadarDexQuoteService({
    metadataClient,
    readClient: createRadarReadClient(),
    quote: quoteRadarDex,
  })(input);

async function executeSwap(input: QuoteRequest): Promise<RadarExecutionResult> {
  const context = buildWriteContext(input.chainId);
  if (!isWriteContext(context)) {
    throw new RadarExecutionError("refresh", "Arc write context is unavailable");
  }
  return executeRadarDexSwap(
    { ...input, account: context.account.address },
    {
      publicClient: context.publicClient,
      walletClient: context.walletClient,
      refreshQuote: async () => (await getQuote(input)).best,
    }
  );
}

async function getRouteHealth(): Promise<readonly RadarRouteHealthEntry[]> {
  return getRadarDexRouteHealth(createRadarReadClient());
}

export const defaultRadarDexToolDependencies: RadarDexToolDependencies = {
  listTokens: () => metadataClient.listTokens(),
  getQuote,
  getRouteHealth,
  executeSwap,
};
