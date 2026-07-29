import type { UniswapV4ReadTransport } from "../../src/uniswap-v4/client.js";

export const CHAIN_ID = 4663;
export const BLOCK_NUMBER = 16_437_583n;
export const BLOCK_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const POOL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
export const TOKEN = "0x2222222222222222222222222222222222222222";
export const OWNER = "0x3333333333333333333333333333333333333333";
export const OPERATOR = "0x4444444444444444444444444444444444444444";
export const SPENDER = "0x5555555555555555555555555555555555555555";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type FixtureOptions = {
  readonly chainId?: number;
  readonly failFunction?: string;
  readonly namedPoolKey?: boolean;
  readonly numericAllowance?: boolean;
  readonly revertFunction?: string;
};

export type FixtureRequest = {
  readonly address: string;
  readonly abi: readonly unknown[];
  readonly args: readonly unknown[] | undefined;
  readonly blockNumber: bigint;
  readonly functionName: string;
};

function responseFor(functionName: string, options: FixtureOptions): unknown {
  switch (functionName) {
    case "protocolFeeController":
      return ZERO_ADDRESS;
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
      return [
        options.namedPoolKey
          ? { currency0: TOKEN, currency1: OWNER, fee: 500, tickSpacing: 60, hooks: OPERATOR }
          : [TOKEN, OWNER, 500, 60, OPERATOR],
        123n,
      ];
    case "allowance":
      return options.numericAllowance ? [1000, 999, 7] : [1000n, 999n, 7n];
    case "name":
      return "Fixture Token";
    case "symbol":
      return "FIX";
    case "decimals":
      return 18;
    default:
      throw new Error(`Unexpected fixture function ${functionName}`);
  }
}

export function createClientFixtureTransport(options: FixtureOptions = {}): {
  readonly requests: FixtureRequest[];
  readonly transport: UniswapV4ReadTransport;
} {
  const requests: FixtureRequest[] = [];
  return {
    requests,
    transport: {
      async getBlock(request) {
        return { hash: BLOCK_HASH, number: request.blockNumber };
      },
      async getBlockNumber(): Promise<bigint> {
        return BLOCK_NUMBER;
      },
      async getChainId(): Promise<number> {
        return options.chainId ?? CHAIN_ID;
      },
      async multicall(request) {
        const calls = request.contracts.map((contract) => ({
          address: contract.address,
          abi: contract.abi,
          args: contract.args,
          blockNumber: request.blockNumber,
          functionName: contract.functionName,
        }));
        requests.push(...calls);
        return request.contracts.map((contract) => {
          if (contract.functionName === options.failFunction) {
            return { error: new Error("fixture multicall revert"), status: "failure" } as const;
          }
          return {
            result: responseFor(contract.functionName, options),
            status: "success",
          } as const;
        });
      },
      async readContract(request) {
        requests.push({
          address: request.address,
          abi: request.abi,
          args: request.args,
          blockNumber: request.blockNumber,
          functionName: request.functionName,
        });
        if (request.functionName === options.revertFunction) {
          throw new Error("fixture direct revert");
        }
        return responseFor(request.functionName, options);
      },
    },
  };
}
