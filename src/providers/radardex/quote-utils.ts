import { type Address, type Hex, getAddress, isHex } from "viem";
import type { RadarRoute, RouteFamily, V4Key } from "./schemas.js";

const FAMILY_PRIORITY: Readonly<Record<RouteFamily, number>> = {
  v4_direct: 0,
  v4_native: 1,
  v4_multihop: 2,
  synthra: 3,
  v3_multihop: 4,
  v3_direct: 5,
  v2: 6,
};

export function rankRoutes(routes: readonly RadarRoute[]): readonly RadarRoute[] {
  return [...routes].sort((left, right) => {
    if (left.expectedOutput !== right.expectedOutput) {
      return left.expectedOutput > right.expectedOutput ? -1 : 1;
    }
    const familyOrder = FAMILY_PRIORITY[left.family] - FAMILY_PRIORITY[right.family];
    return familyOrder === 0 ? left.id.localeCompare(right.id) : familyOrder;
  });
}

type V3PathHop =
  | { readonly token: Address; readonly fee: number }
  | { readonly token: Address; readonly fee?: never };

export function encodeV3Path(hops: readonly V3PathHop[]): Hex {
  if (hops.length < 2) throw new RangeError("V3 path needs at least two tokens");
  let encoded = "0x";
  for (const [index, hop] of hops.entries()) {
    encoded += hop.token.slice(2).toLowerCase();
    if (index < hops.length - 1) {
      if (hop.fee === undefined) throw new RangeError("Every non-terminal V3 hop needs a fee");
      encoded += hop.fee.toString(16).padStart(6, "0");
    }
  }
  if (!isHex(encoded)) throw new TypeError("Encoded V3 path is not hex data");
  return encoded;
}

type OrderedV4KeyInput = {
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: Address;
};

export function orderedV4Key(input: OrderedV4KeyInput): {
  readonly key: V4Key;
  readonly zeroForOne: boolean;
} {
  const inputFirst = input.tokenIn.toLowerCase() < input.tokenOut.toLowerCase();
  return {
    key: {
      currency0: getAddress(inputFirst ? input.tokenIn : input.tokenOut),
      currency1: getAddress(inputFirst ? input.tokenOut : input.tokenIn),
      fee: input.fee,
      tickSpacing: input.tickSpacing,
      hooks: input.hooks,
    },
    zeroForOne: inputFirst,
  };
}
