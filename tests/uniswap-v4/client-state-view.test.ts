import { describe, expect, it } from "vitest";

import { UNISWAP_V4_STATE_VIEW_ABI } from "../../src/uniswap-v4/abis.js";
import {
  type UniswapV4ReadContractRequest,
  type UniswapV4ReadTransport,
  createUniswapV4ReadClient,
} from "../../src/uniswap-v4/client.js";

const BLOCK_NUMBER = 16_437_583n;
const POOL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const POSITION_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";
const STATE_VIEW = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";

function createFixtureTransport(): {
  readonly calls: UniswapV4ReadContractRequest[];
  readonly transport: UniswapV4ReadTransport;
} {
  const calls: UniswapV4ReadContractRequest[] = [];
  return {
    calls,
    transport: {
      async getBlock(request) {
        return {
          hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          number: request.blockNumber,
        };
      },
      async getBlockNumber(): Promise<bigint> {
        return BLOCK_NUMBER;
      },
      async getChainId(): Promise<number> {
        return 4663;
      },
      async multicall(request) {
        calls.push(...request.contracts);
        return request.contracts.map((contract) => {
          switch (contract.functionName) {
            case "getFeeGrowthInside":
              return { result: [303n, 404n], status: "success" } as const;
            case "getPositionInfo":
              return { result: [77n, 101n, 202n], status: "success" } as const;
            default:
              throw new Error(`Unexpected StateView function ${contract.functionName}`);
          }
        });
      },
      async readContract() {
        throw new Error("StateView reads use multicall");
      },
    },
  };
}

describe("Uniswap v4 StateView position reads", () => {
  it("Given a PositionManager NFT, when cached and current fee growth are read, then calls the pinned StateView ABI with owner and bytes32 token salt", async () => {
    const fixture = createFixtureTransport();
    const client = createUniswapV4ReadClient({ chainId: 4663, client: fixture.transport });

    const current = await client.readStateViewFeeGrowthInside({
      blockNumber: BLOCK_NUMBER,
      poolId: POOL_ID,
      tickLower: -120,
      tickUpper: 120,
    });
    const cached = await client.readStateViewPositionInfo({
      blockNumber: BLOCK_NUMBER,
      poolId: POOL_ID,
      tickLower: -120,
      tickUpper: 120,
      tokenId: 42n,
    });

    expect(current).toMatchObject({ feeGrowthInside0X128: 303n, feeGrowthInside1X128: 404n });
    expect(cached).toMatchObject({
      feeGrowthInside0LastX128: 101n,
      feeGrowthInside1LastX128: 202n,
      liquidity: 77n,
    });
    expect(fixture.calls).toEqual([
      expect.objectContaining({
        abi: UNISWAP_V4_STATE_VIEW_ABI,
        address: STATE_VIEW,
        args: [POOL_ID, -120, 120],
        blockNumber: BLOCK_NUMBER,
        functionName: "getFeeGrowthInside",
      }),
      expect.objectContaining({
        abi: UNISWAP_V4_STATE_VIEW_ABI,
        address: STATE_VIEW,
        args: [
          POOL_ID,
          POSITION_MANAGER,
          -120,
          120,
          "0x000000000000000000000000000000000000000000000000000000000000002a",
        ],
        blockNumber: BLOCK_NUMBER,
        functionName: "getPositionInfo",
      }),
    ]);
  });
});
