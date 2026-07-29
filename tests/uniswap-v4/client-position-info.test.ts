import { describe, expect, it } from "vitest";

import {
  type UniswapV4ReadTransport,
  createUniswapV4ReadClient,
} from "../../src/uniswap-v4/client.js";

const CHAIN_ID = 4663;
const BLOCK_NUMBER = 16_437_583n;
const POOL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const POSITION_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";

describe("Uniswap v4 StateView position reads", () => {
  it("Given an NFT token ID, when reading cached position facts, then queries StateView with PositionManager ownership and uint256 salt", async () => {
    const calls: {
      readonly args: readonly unknown[] | undefined;
      readonly functionName: string;
    }[] = [];
    const transport: UniswapV4ReadTransport = {
      async getBlock(request) {
        return { hash: `0x${"aa".repeat(32)}`, number: request.blockNumber };
      },
      async getBlockNumber(): Promise<bigint> {
        return BLOCK_NUMBER;
      },
      async getChainId(): Promise<number> {
        return CHAIN_ID;
      },
      async multicall(request) {
        calls.push(
          ...request.contracts.map((contract) => ({
            args: contract.args,
            functionName: contract.functionName,
          }))
        );
        return request.contracts.map(
          () => ({ result: [77n, 1n << 128n, 2n << 128n], status: "success" }) as const
        );
      },
      async readContract() {
        throw new Error("not used");
      },
    };
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: transport });

    const position = await client.readStateViewPositionInfo({
      blockNumber: BLOCK_NUMBER,
      poolId: POOL_ID,
      tickLower: -120,
      tickUpper: 120,
      tokenId: 42n,
    });

    expect(position).toEqual({
      blockNumber: BLOCK_NUMBER,
      feeGrowthInside0LastX128: 1n << 128n,
      feeGrowthInside1LastX128: 2n << 128n,
      liquidity: 77n,
    });
    expect(calls).toEqual([
      {
        args: [POOL_ID, POSITION_MANAGER, -120, 120, `0x${"0".repeat(62)}2a`],
        functionName: "getPositionInfo",
      },
    ]);
  });
});
