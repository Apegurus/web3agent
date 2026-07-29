import { describe, expect, it } from "vitest";

import {
  type UniswapV4ReadCall,
  type UniswapV4ReadTransport,
  createUniswapV4ReadExecutor,
} from "../../src/uniswap-v4/client-transport.js";

const BLOCK_NUMBER = 16_437_583n;
const CHAIN_ID = 4663;
const DEPLOYMENT = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";

const FIRST_CALL: UniswapV4ReadCall = {
  abi: [],
  address: DEPLOYMENT,
  args: [],
  contract: "Fixture",
  functionName: "first",
};
const SECOND_CALL: UniswapV4ReadCall = {
  abi: [],
  address: DEPLOYMENT,
  args: [],
  contract: "Fixture",
  functionName: "second",
};

function createExecutor(entries: readonly unknown[]) {
  const transport: UniswapV4ReadTransport = {
    getBlock: async (request) => ({
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      number: request.blockNumber,
    }),
    getBlockNumber: async () => BLOCK_NUMBER,
    getChainId: async () => CHAIN_ID,
    multicall: async () => entries,
    readContract: async () => "unused",
  };
  return createUniswapV4ReadExecutor({
    chainId: CHAIN_ID,
    deploymentAddress: DEPLOYMENT,
    transport,
  });
}

describe("Uniswap v4 multicall response boundary", () => {
  it.each([
    { actualCount: 0, entries: [] },
    {
      actualCount: 2,
      entries: [
        { result: "first", status: "success" },
        { result: "unexpected", status: "success" },
      ],
    },
  ])("rejects a result count of $actualCount for one call", async ({ actualCount, entries }) => {
    // Given: a transport response with fewer or extra result entries.
    const executor = createExecutor(entries);

    // When: one explicit-block call is dispatched through the multicall boundary.
    const invoke = () => executor.multicall([FIRST_CALL], BLOCK_NUMBER);

    // Then: cardinality cannot silently alter the resulting read order.
    await expect(invoke()).rejects.toMatchObject({
      code: "UNISWAP_V4_MULTICALL_CARDINALITY_MISMATCH",
      details: { actualCount, blockNumber: BLOCK_NUMBER, chainId: CHAIN_ID, expectedCount: 1 },
    });
  });

  it.each([null, undefined, "rpc error"])(
    "rejects a malformed failure payload of %p",
    async (error) => {
      // Given: a viem-shaped failure entry with a non-Error payload.
      const executor = createExecutor([{ error, status: "failure" }]);

      // When: the explicit-block call is parsed at the transport boundary.
      const invoke = () => executor.multicall([FIRST_CALL], BLOCK_NUMBER);

      // Then: the provider defect is represented by stable typed context, not a TypeError.
      await expect(invoke()).rejects.toMatchObject({
        code: "UNISWAP_V4_MULTICALL_MALFORMED_RESULT",
        details: expect.objectContaining({
          blockNumber: BLOCK_NUMBER,
          call: expect.objectContaining({ functionName: "first" }),
          chainId: CHAIN_ID,
          index: 0,
          reason: "failure result must include an Error instance",
        }),
      });
    }
  );

  it("preserves successful result ordering exactly", async () => {
    // Given: two valid success entries in requested call order.
    const executor = createExecutor([
      { result: "first", status: "success" },
      { result: "second", status: "success" },
    ]);

    // When: both calls share one explicit block.
    const results = await executor.multicall([FIRST_CALL, SECOND_CALL], BLOCK_NUMBER);

    // Then: each returned value retains its original call index.
    expect(results).toEqual(["first", "second"]);
  });
});
