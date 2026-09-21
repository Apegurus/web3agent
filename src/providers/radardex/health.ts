import type { Address } from "viem";
import { RADARDEX_ARC } from "./manifest.js";
import { type RadarReadClient, errorMessage, readLiveFee, requireBytecode } from "./quote-core.js";

type HealthTarget = {
  readonly venue: string;
  readonly wrapper?: Address;
  readonly contracts: readonly Address[];
};

export type RadarRouteHealthEntry = {
  readonly venue: string;
  readonly available: boolean;
  readonly feeBps?: number;
  readonly reason?: string;
};

const TARGETS: readonly HealthTarget[] = [
  {
    venue: "v3:direct",
    wrapper: RADARDEX_ARC.routers.v3Fee,
    contracts: [RADARDEX_ARC.routers.v3, RADARDEX_ARC.quoters.v3],
  },
  {
    venue: "v3:multihop",
    wrapper: RADARDEX_ARC.routers.v3MultihopFee,
    contracts: [RADARDEX_ARC.routers.v3, RADARDEX_ARC.quoters.v3],
  },
  {
    venue: "v2",
    wrapper: RADARDEX_ARC.routers.v2Fee,
    contracts: [RADARDEX_ARC.v2Routers.dyor, RADARDEX_ARC.v2Routers.warp],
  },
  {
    venue: "v4:direct",
    wrapper: RADARDEX_ARC.routers.v4Fee,
    contracts: [RADARDEX_ARC.routers.v4, RADARDEX_ARC.quoters.v4],
  },
  {
    venue: "v4:native",
    wrapper: RADARDEX_ARC.routers.v4NativeFee,
    contracts: [RADARDEX_ARC.quoters.v4],
  },
  {
    venue: "v4:multihop",
    wrapper: RADARDEX_ARC.routers.v4MultihopFee,
    contracts: [RADARDEX_ARC.quoters.v4],
  },
  { venue: "synthra", contracts: [RADARDEX_ARC.routers.synthra, RADARDEX_ARC.quoters.synthra] },
];

async function inspectTarget(
  client: RadarReadClient,
  target: HealthTarget
): Promise<RadarRouteHealthEntry> {
  try {
    await Promise.all(
      target.contracts.map((address) => requireBytecode(client, target.venue, address))
    );
    const feeBps = target.wrapper
      ? await readLiveFee(client, target.venue, target.wrapper)
      : undefined;
    return {
      venue: target.venue,
      available: true,
      ...(feeBps === undefined ? {} : { feeBps }),
    };
  } catch (error: unknown) {
    return { venue: target.venue, available: false, reason: errorMessage(error) };
  }
}

export async function getRadarDexRouteHealth(
  client: RadarReadClient
): Promise<readonly RadarRouteHealthEntry[]> {
  return Promise.all(TARGETS.map((target) => inspectTarget(client, target)));
}
