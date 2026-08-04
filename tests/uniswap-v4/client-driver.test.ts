import { expect, it } from "vitest";

import { Web3AgentError } from "../../src/api/errors.js";
import {
  type UniswapV4ReadTransport,
  createUniswapV4ReadClient,
} from "../../src/uniswap-v4/client.js";

const BLOCK_NUMBER = 16437583n;
const POOL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const OWNER = "0x3333333333333333333333333333333333333333";
const OPERATOR = "0x4444444444444444444444444444444444444444";
const SPENDER = "0x5555555555555555555555555555555555555555";

function responseFor(functionName: string): unknown {
  switch (functionName) {
    case "protocolFeeController":
      return "0x0000000000000000000000000000000000000000";
    case "getSlot0":
      return [79228162514264337593543950336n, -120, 11, 500];
    case "getLiquidity":
      return 900n;
    case "getFeeGrowthGlobals":
      return [101n, 202n];
    case "ownerOf":
      return OWNER;
    case "getApproved":
      return OPERATOR;
    case "getPositionLiquidity":
      return 77n;
    case "getPoolAndPositionInfo":
      return [[TOKEN, OWNER, 500, 60, OPERATOR], 123n];
    case "allowance":
      return [1000n, 999n, 7n];
    case "name":
      return "Fixture Token";
    case "symbol":
      return "FIX";
    case "decimals":
      return 18;
    default:
      throw new Error(`unexpected fixture read ${functionName}`);
  }
}

function createTransport(failFunction?: string): UniswapV4ReadTransport {
  return {
    getBlock: async (request) => ({
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      number: request.blockNumber,
    }),
    getBlockNumber: async () => BLOCK_NUMBER,
    getChainId: async () => 4663,
    multicall: async ({ contracts }) =>
      contracts.map((contract) =>
        contract.functionName === failFunction
          ? { error: new Error("fixture multicall revert"), status: "failure" }
          : { result: responseFor(contract.functionName), status: "success" }
      ),
    readContract: async ({ functionName }) => responseFor(functionName),
  };
}

function partialFailureFrom(
  error: unknown
):
  | { readonly code: string; readonly failedFunction: string; readonly message: string }
  | undefined {
  if (!(error instanceof Web3AgentError) || !error.details || typeof error.details !== "object") {
    return undefined;
  }
  if (!("calls" in error.details) || !Array.isArray(error.details.calls)) {
    return undefined;
  }
  const failedCall = error.details.calls[0];
  if (!failedCall || typeof failedCall !== "object" || !("functionName" in failedCall)) {
    return undefined;
  }
  if (typeof failedCall.functionName !== "string") {
    return undefined;
  }
  return { code: error.code, failedFunction: failedCall.functionName, message: error.message };
}

it("emits a coherent fixture snapshot and actionable partial failure", async () => {
  // Given: deterministic viem-shaped clients for a successful and failed same-block read.
  const reader = createUniswapV4ReadClient({ chainId: 4663, client: createTransport() });
  const failingReader = createUniswapV4ReadClient({
    chainId: 4663,
    client: createTransport("getLiquidity"),
  });

  // When: the driver reads the deployment snapshot and a partially reverted StateView batch.
  const snapshot = await reader.readSnapshot({
    blockNumber: BLOCK_NUMBER,
    owner: OWNER,
    poolId: POOL_ID,
    spender: SPENDER,
    token: { address: TOKEN, chainId: 4663 },
    tokenId: 7n,
  });
  let partialFailure:
    | { readonly code: string; readonly failedFunction: string; readonly message: string }
    | undefined;
  try {
    await failingReader.readStateViewPool({ blockNumber: BLOCK_NUMBER, poolId: POOL_ID });
  } catch (error: unknown) {
    const parsedFailure = partialFailureFrom(error);
    if (!parsedFailure) {
      throw error;
    }
    partialFailure = parsedFailure;
  }

  // Then: the human-visible driver emits only one block and the actionable failed call.
  expect(partialFailure).toEqual({
    code: "UNISWAP_V4_MULTICALL_FAILED",
    failedFunction: "getLiquidity",
    message: "Uniswap v4 multicall failed for 1 read(s) at block 16437583",
  });
  process.stderr.write(
    `${JSON.stringify(
      { partialFailure, snapshot },
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )}\n`
  );
});
