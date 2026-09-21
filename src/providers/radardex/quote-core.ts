import type { Abi, Address, Hex } from "viem";
import { z } from "zod";
import { RADARDEX_ABIS } from "./manifest.js";
import type { RadarRoute, RouteHealth } from "./schemas.js";

export type RadarReadRequest = {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
};

export interface RadarReadClient {
  getBytecode(request: { readonly address: Address }): Promise<Hex | undefined>;
  readContract(request: RadarReadRequest): Promise<unknown>;
}

export type ProbeContext = {
  readonly client: RadarReadClient;
  readonly fromToken: Address;
  readonly toToken: Address;
  readonly grossInput: bigint;
};

export type ProbeResult = {
  readonly routes: readonly RadarRoute[];
  readonly health: readonly RouteHealth[];
};

export class RadarRouteUnavailableError extends Error {
  readonly name = "RadarRouteUnavailableError";

  constructor(
    readonly venue: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${venue}: ${message}`, options);
  }
}

const feeSchema = z.bigint().min(0n).max(1_000n);
export const v3QuoteSchema = z.tuple([z.bigint().positive(), z.unknown(), z.unknown(), z.bigint()]);
export const v4QuoteSchema = z.tuple([z.bigint().positive(), z.bigint()]);
export const v2QuoteSchema = z.array(z.bigint()).min(2);

export async function readLiveFee(
  client: RadarReadClient,
  venue: string,
  wrapper: Address
): Promise<number> {
  const bytecode = await client.getBytecode({ address: wrapper });
  if (!bytecode || bytecode === "0x") {
    throw new RadarRouteUnavailableError(venue, "execution contract has no bytecode");
  }
  const value = await client.readContract({
    address: wrapper,
    abi: RADARDEX_ABIS.fee,
    functionName: "feeBps",
  });
  return Number(feeSchema.parse(value));
}

export async function requireBytecode(
  client: RadarReadClient,
  venue: string,
  address: Address
): Promise<void> {
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") {
    throw new RadarRouteUnavailableError(venue, "contract has no bytecode");
  }
}

export function netAfterFee(grossInput: bigint, feeBps: number): bigint {
  return grossInput - (grossInput * BigInt(feeBps)) / 10_000n;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
