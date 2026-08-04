import type { UniswapV4ReadTransport } from "../../../src/uniswap-v4/client.js";
import { createUniswapV4ReadClient } from "../../../src/uniswap-v4/client.js";
import { getPoolIdentity } from "../../../src/uniswap-v4/sdk-adapter-api.js";
import { type RobinhoodV4Fixture, parseRobinhoodV4Fixture } from "./robinhood-v4-schema.js";
import fixtureDocument from "./robinhood-v4.json";

export { robinhoodV4FixtureSchema } from "./robinhood-v4-schema.js";
export { parseRobinhoodV4Fixture } from "./robinhood-v4-schema.js";
export type { RobinhoodV4Fixture } from "./robinhood-v4-schema.js";

export const robinhoodV4Fixture = parseRobinhoodV4Fixture(fixtureDocument);

export function createRobinhoodV4FixtureTransport(fixture: RobinhoodV4Fixture): {
  readonly readClient: ReturnType<typeof createUniswapV4ReadClient>;
  readonly requests: Array<{ readonly blockNumber: bigint; readonly functionName: string }>;
  readonly transactionSubmissions: 0;
} {
  const requests: Array<{ readonly blockNumber: bigint; readonly functionName: string }> = [];
  const blockNumber = BigInt(fixture.sourceBlock.blockNumber);
  const positionPoolIdMask =
    0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000n;
  const positionInfo =
    (BigInt(getPoolIdentity(fixture.pool.poolKey).poolId) & positionPoolIdMask) |
    (BigInt.asUintN(24, BigInt(fixture.position.tickUpper)) << 32n) |
    (BigInt.asUintN(24, BigInt(fixture.position.tickLower)) << 8n);
  const transport: UniswapV4ReadTransport = {
    async getBlock(request) {
      if (request.blockNumber !== blockNumber) throw new Error("fixture block must stay pinned");
      return { hash: fixture.sourceBlock.blockHash, number: request.blockNumber };
    },
    async getBlockNumber() {
      return blockNumber;
    },
    async getChainId() {
      return fixture.chainId;
    },
    async multicall(request) {
      return request.contracts.map((contract) => {
        requests.push({ blockNumber: contract.blockNumber, functionName: contract.functionName });
        switch (contract.functionName) {
          case "getSlot0":
            return { result: [79228162514264337593543950336n, 0, 11, 500], status: "success" };
          case "getLiquidity":
            return { result: 900n, status: "success" };
          case "getFeeGrowthGlobals":
            return { result: [101n, 202n], status: "success" };
          case "ownerOf":
            return { result: fixture.position.owner, status: "success" };
          case "getApproved":
            return { result: fixture.position.operator, status: "success" };
          case "getPositionLiquidity":
            return { result: BigInt(fixture.position.liquidity), status: "success" };
          case "getPoolAndPositionInfo":
            return {
              result: [
                [
                  "0x0000000000000000000000000000000000000000",
                  fixture.token.address,
                  fixture.pool.poolKey.fee,
                  fixture.pool.poolKey.tickSpacing,
                  fixture.pool.poolKey.hooks,
                ],
                positionInfo,
              ],
              status: "success",
            };
          case "getFeeGrowthInside":
            return {
              result: [
                BigInt(fixture.position.feeGrowthInside0X128),
                BigInt(fixture.position.feeGrowthInside1X128),
              ],
              status: "success",
            };
          case "getPositionInfo":
            return {
              result: [
                BigInt(fixture.position.liquidity),
                BigInt(fixture.position.feeGrowthInside0LastX128),
                BigInt(fixture.position.feeGrowthInside1LastX128),
              ],
              status: "success",
            };
          default:
            throw new Error(`unexpected fixture multicall ${contract.functionName}`);
        }
      });
    },
    async readContract(request) {
      requests.push({ blockNumber: request.blockNumber, functionName: request.functionName });
      throw new Error("fixture integration uses only multicall reads");
    },
  };
  return {
    readClient: createUniswapV4ReadClient({
      chainId: fixture.chainId,
      client: transport,
      deployment: fixture.deployment,
    }),
    requests,
    transactionSubmissions: 0,
  };
}
