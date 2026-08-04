import type {
  UniswapV4BlockReference,
  UniswapV4LifecycleOperation,
  UniswapV4PoolKey,
} from "../../src/api/types.js";
import { createPersistedUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-plans.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";

const ACCOUNT: `0x${string}` = "0x1111111111111111111111111111111111111111";
const TOKEN: `0x${string}` = "0x2222222222222222222222222222222222222222";
const sourceBlock = {
  blockHash: `0x${"aa".repeat(32)}`,
  blockNumber: "16437583",
  chainId: 4663,
} satisfies UniswapV4BlockReference;
const poolKey = {
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

export function createWriteSecurityPlan(kind: "burn" | "mint", includeApproval = false) {
  const deployment = getUniswapV4Deployment(4663);
  const operation = (
    kind === "burn"
      ? {
          account: ACCOUNT,
          amount0Min: "0",
          amount1Min: "0",
          chainId: 4663,
          deadline: "4102444800",
          hookData: "0x",
          kind: "burn" as const,
          liquidity: "10",
          liquidityBps: 10000,
          poolKey,
          recipient: ACCOUNT,
          slippageBps: 0,
          sourceBlock,
          tokenId: "7",
        }
      : {
          account: ACCOUNT,
          amount0Max: "10",
          amount1Max: "10",
          chainId: 4663,
          createPool: false,
          deadline: "4102444800",
          hookData: "0x",
          kind: "mint" as const,
          liquidity: "10",
          poolKey,
          slippageBps: 0,
          sourceBlock,
          tickLower: -120,
          tickUpper: 120,
        }
  ) satisfies UniswapV4LifecycleOperation;
  return createPersistedUniswapV4WritePlan({
    deployment,
    operation,
    plan: {
      actions: [
        ...(includeApproval
          ? [
              {
                amount: 10n,
                data: "0x095ea7b3" as const,
                kind: "erc20Approval" as const,
                spender: deployment.permit2,
                to: TOKEN,
                token: TOKEN,
                value: 0n,
              },
            ]
          : []),
        {
          data: "0x1234" as const,
          kind: "positionManager" as const,
          to: deployment.positionManager,
          value: 0n,
        },
      ],
      expectedDeltas: {
        kind,
        liquidityDelta: kind === "burn" ? "-10" : "10",
        nativeValueDelta: "0",
        token0Delta: kind === "burn" ? "1" : "-1",
        token1Delta: kind === "burn" ? "1" : "-1",
      },
      ...(kind === "burn" ? { expectedNftState: "burned" as const } : {}),
      poolId: `0x${"bb".repeat(32)}`,
      sourceBlock,
    },
  });
}
