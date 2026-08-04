import type { UniswapV4BlockReference, UniswapV4PoolKey } from "../../src/api/types.js";
import { createPersistedUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-plans.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";

export const ACCOUNT: `0x${string}` = "0x1111111111111111111111111111111111111111";
const TOKEN: `0x${string}` = "0x2222222222222222222222222222222222222222";
const SOURCE_BLOCK = {
  blockHash: `0x${"aa".repeat(32)}`,
  blockNumber: "16437583",
  chainId: 4663,
} satisfies UniswapV4BlockReference;
const POOL_KEY = {
  currency0: { chainId: 4663, decimals: 18, kind: "native" as const, name: "Ether", symbol: "ETH" },
  currency1: {
    address: TOKEN,
    chainId: 4663,
    decimals: 18,
    kind: "erc20" as const,
    name: "Fixture token",
    symbol: "FIX",
  },
  fee: 500,
  hooks: "0x0000000000000000000000000000000000000000" as const,
  tickSpacing: 60,
} satisfies UniswapV4PoolKey;

export function mintPlan(deployment = getUniswapV4Deployment(4663)) {
  return createPersistedUniswapV4WritePlan({
    deployment,
    operation: {
      account: ACCOUNT,
      amount0Max: "100",
      amount1Max: "100",
      chainId: 4663,
      createPool: false,
      deadline: "4102444800",
      hookData: "0x",
      kind: "mint",
      liquidity: "10",
      poolKey: POOL_KEY,
      slippageBps: 100,
      sourceBlock: SOURCE_BLOCK,
      tickLower: -120,
      tickUpper: 120,
    },
    plan: {
      actions: [
        {
          amount: 100n,
          data: "0x095ea7b3000000000000000000000000000000000000000000000000000000000000000001" as const,
          kind: "erc20Approval" as const,
          spender: deployment.permit2,
          to: TOKEN,
          token: TOKEN,
          value: 0n,
        },
        {
          domain: {
            chainId: 4663,
            name: "Permit2" as const,
            verifyingContract: deployment.permit2,
          },
          kind: "permit2Signature" as const,
          message: {
            details: [{ amount: 100n, expiration: 4102444800n, nonce: 1n, token: TOKEN }],
            sigDeadline: 4102444800n,
            spender: deployment.positionManager,
          },
          primaryType: "PermitBatch" as const,
          types: { PermitBatch: [], PermitDetails: [] },
        },
        {
          data: "0x1234" as const,
          kind: "positionManager" as const,
          to: deployment.positionManager,
          value: 0n,
        },
      ],
      expectedDeltas: {
        kind: "mint" as const,
        liquidityDelta: "10",
        nativeValueDelta: "0",
        token0Delta: "-1",
        token1Delta: "-1",
      },
      poolId: `0x${"bb".repeat(32)}`,
      sourceBlock: SOURCE_BLOCK,
    },
  });
}
