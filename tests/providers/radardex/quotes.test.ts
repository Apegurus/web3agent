import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { RADARDEX_ARC } from "../../../src/providers/radardex/manifest.js";
import {
  encodeV3Path,
  getRadarDexRouteHealth,
  quoteRadarDex,
  rankRoutes,
} from "../../../src/providers/radardex/quotes.js";
import type { RadarRoute } from "../../../src/providers/radardex/schemas.js";

const TOKEN_A = "0x1111111111111111111111111111111111111111" satisfies Address;
const TOKEN_B = "0x2222222222222222222222222222222222222222" satisfies Address;
const HASH = "0x1234" satisfies Hex;

function route(family: RadarRoute["family"], expectedOutput: bigint, id: string): RadarRoute {
  return {
    id,
    family,
    label: family,
    fromToken: TOKEN_A,
    toToken: TOKEN_B,
    grossInput: 1_000n,
    netInput: 997n,
    expectedOutput,
    spender: RADARDEX_ARC.routers.v3Fee,
    feeBps: 30,
    executable: true,
    path: [TOKEN_A, TOKEN_B],
    execution: { kind: "v3_direct", poolFee: 500 },
  };
}

describe("RadarDEX quotes", () => {
  it("reports executable contract bytecode and live wrapper fee health", async () => {
    // Given
    const missing = RADARDEX_ARC.routers.v4NativeFee.toLowerCase();
    const client = {
      getBytecode: vi.fn(async ({ address }: { address: string }) =>
        address.toLowerCase() === missing ? undefined : HASH
      ),
      readContract: vi.fn().mockResolvedValue(30n),
    };

    // When
    const health = await getRadarDexRouteHealth(client);

    // Then
    expect(health.find(({ venue }) => venue === "v3:direct")).toMatchObject({
      available: true,
      feeBps: 30,
    });
    expect(health.find(({ venue }) => venue === "v4:native")).toMatchObject({
      available: false,
    });
  });

  it("ranks highest output first with deterministic family and id tie breaks", () => {
    // Given
    const routes = [
      route("v2", 1_100n, "z"),
      route("v3_direct", 1_100n, "b"),
      route("v3_direct", 1_100n, "a"),
      route("synthra", 1_099n, "s"),
    ];

    // When
    const ranked = rankRoutes(routes);

    // Then
    expect(ranked.map(({ id }) => id)).toEqual(["a", "b", "z", "s"]);
  });

  it("encodes a V3 multihop path with uint24 fees", () => {
    // Given
    // When
    const path = encodeV3Path([
      { token: TOKEN_A, fee: 500 },
      { token: RADARDEX_ARC.usdc, fee: 3000 },
      { token: TOKEN_B },
    ]);

    // Then
    expect(path).toBe(
      `0x${TOKEN_A.slice(2)}0001f4${RADARDEX_ARC.usdc.slice(2)}000bb8${TOKEN_B.slice(2)}`
    );
  });

  it("uses live wrapper fees and preserves healthy routes when another venue fails", async () => {
    // Given
    const readContract = vi.fn(
      async (request: { address: string; functionName: string; args?: readonly unknown[] }) => {
        if (request.functionName === "feeBps") return 30n;
        if (request.address.toLowerCase() === RADARDEX_ARC.quoters.v3.toLowerCase()) {
          if (request.functionName === "quoteExactInput") return [1_250n, [], [], 210_000n];
          return [1_200n, 0n, 0, 95_000n];
        }
        if (request.address.toLowerCase() === RADARDEX_ARC.v2Routers.dyor.toLowerCase()) {
          return [997n, 1_150n];
        }
        if (request.address.toLowerCase() === RADARDEX_ARC.v2Routers.warp.toLowerCase()) {
          throw new Error("pool unavailable");
        }
        if (request.address.toLowerCase() === RADARDEX_ARC.quoters.v4.toLowerCase()) {
          return [1_300n, 120_000n];
        }
        if (request.address.toLowerCase() === RADARDEX_ARC.quoters.synthra.toLowerCase()) {
          return [1_275n, 0n, 0, 100_000n];
        }
        throw new Error(`unexpected ${request.address}:${request.functionName}`);
      }
    );
    const client = {
      getBytecode: vi.fn().mockResolvedValue(HASH),
      readContract,
    };

    // When
    const result = await quoteRadarDex(
      {
        chainId: 5042,
        fromToken: TOKEN_A,
        toToken: TOKEN_B,
        fromAmount: "1000",
        slippageBps: 100,
      },
      {
        client,
        metadata: {
          v4Pools: [
            {
              tokenA: TOKEN_A,
              tokenB: TOKEN_B,
              feeTier: 500,
              tickSpacing: 10,
              hooks: RADARDEX_ARC.zeroAddress,
              nativeQuote: false,
            },
            {
              tokenA: TOKEN_A,
              tokenB: RADARDEX_ARC.usdc,
              feeTier: 500,
              tickSpacing: 10,
              hooks: RADARDEX_ARC.zeroAddress,
              nativeQuote: false,
            },
            {
              tokenA: RADARDEX_ARC.usdc,
              tokenB: TOKEN_B,
              feeTier: 3000,
              tickSpacing: 60,
              hooks: RADARDEX_ARC.zeroAddress,
              nativeQuote: false,
            },
          ],
          synthraFeeTiers: [500],
          hubs: [RADARDEX_ARC.usdc],
        },
      }
    );

    // Then
    expect(result.routes.map(({ family }) => family)).toEqual([
      "v4_direct",
      "v4_multihop",
      "synthra",
      "v3_multihop",
      "v3_direct",
      "v2",
    ]);
    expect(result.best?.netInput).toBe(997n);
    expect(result.best?.feeBps).toBe(30);
    expect(result.health.some((entry) => entry.venue === "v2:warp" && !entry.available)).toBe(true);
  });

  it("quotes native V4 using 18-to-6 decimal scaling", async () => {
    // Given
    const readContract = vi.fn(async (request: { functionName: string }) => {
      if (request.functionName === "feeBps") return 30n;
      return [2_000_000_000_000_000_000n, 150_000n];
    });

    // When
    const result = await quoteRadarDex(
      {
        chainId: 5042,
        fromToken: TOKEN_A,
        toToken: RADARDEX_ARC.usdc,
        fromAmount: "1000000000000000000",
        slippageBps: 50,
      },
      {
        client: { getBytecode: vi.fn().mockResolvedValue(HASH), readContract },
        metadata: {
          v4Pools: [
            {
              tokenA: RADARDEX_ARC.zeroAddress,
              tokenB: TOKEN_A,
              feeTier: 500,
              tickSpacing: 10,
              hooks: RADARDEX_ARC.zeroAddress,
              nativeQuote: true,
            },
          ],
          synthraFeeTiers: [],
          hubs: [],
        },
      }
    );

    // Then
    const native = result.routes.find(({ family }) => family === "v4_native");
    expect(native?.expectedOutput).toBe(2_000_000n);
    expect(native?.execution.kind).toBe("v4_native");
  });
});
