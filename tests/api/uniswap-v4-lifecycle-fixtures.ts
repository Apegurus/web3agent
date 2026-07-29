import { uniswapV4LifecycleOperationSchema } from "../../src/api/schemas/uniswap-v4/lifecycle.js";
import {
  hashUniswapV4Deployment,
  hashUniswapV4WritePlan,
} from "../../src/tools/uniswap-v4/write-plans.js";
import { uniswapV4PersistedWritePlanSchema } from "../../src/tools/uniswap-v4/write-schemas.js";

export const ACCOUNT = "0x1111111111111111111111111111111111111111";
export const TOKEN = "0x2222222222222222222222222222222222222222";
export const POSITION_MANAGER = "0x3333333333333333333333333333333333333333";
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const HASH = `0x${"aa".repeat(32)}`;

export type LifecycleKind = "mint" | "increase" | "decrease" | "collect" | "burn";

export function operation(kind: LifecycleKind) {
  const base = {
    account: ACCOUNT,
    chainId: 4663,
    deadline: "4102444800",
    hookData: "0x",
    poolKey: {
      currency0: {
        address: ACCOUNT,
        chainId: 4663,
        decimals: 18,
        kind: "erc20" as const,
        name: "A",
        symbol: "A",
      },
      currency1: {
        address: TOKEN,
        chainId: 4663,
        decimals: 18,
        kind: "erc20" as const,
        name: "B",
        symbol: "B",
      },
      fee: 500,
      hooks: "0x0000000000000000000000000000000000000000",
      tickSpacing: 60,
    },
    sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
  };
  switch (kind) {
    case "mint":
      return uniswapV4LifecycleOperationSchema.parse({
        ...base,
        amount0Max: "1",
        amount1Max: "1",
        createPool: false,
        kind,
        liquidity: "1",
        slippageBps: 0,
        tickLower: -60,
        tickUpper: 60,
      });
    case "increase":
      return uniswapV4LifecycleOperationSchema.parse({
        ...base,
        amount0Max: "1",
        amount1Max: "1",
        kind,
        liquidity: "1",
        slippageBps: 0,
        tickLower: -60,
        tickUpper: 60,
        tokenId: "1",
      });
    case "collect":
      return uniswapV4LifecycleOperationSchema.parse({
        ...base,
        kind,
        recipient: ACCOUNT,
        slippageBps: 0,
        tokenId: "1",
      });
    case "decrease":
    case "burn":
      return uniswapV4LifecycleOperationSchema.parse({
        ...base,
        amount0Min: "0",
        amount1Min: "0",
        kind,
        liquidity: "1",
        liquidityBps: kind === "burn" ? 10_000 : 1,
        recipient: ACCOUNT,
        slippageBps: 0,
        tokenId: "1",
      });
  }
}

export function plan(kind: LifecycleKind, delegated = false) {
  const positionManager = {
    data: "0xdeadbeef",
    dataHash: HASH,
    kind: "positionManager" as const,
    to: POSITION_MANAGER,
    value: "0",
  };
  const unsignedFinal = {
    data: positionManager.data,
    dataHash: positionManager.dataHash,
    to: positionManager.to,
    value: positionManager.value,
  };
  const approval = {
    amount: "1",
    data: "0xdeadbeef",
    dataHash: HASH,
    kind: "erc20Approval" as const,
    spender: PERMIT2,
    to: TOKEN,
    token: TOKEN,
    value: "0",
  };
  const permit = {
    domain: { chainId: 4663, name: "Permit2" as const, verifyingContract: PERMIT2 },
    kind: "permit2Signature" as const,
    message: {
      details: [{ amount: "1", expiration: "4102444800", nonce: "0", token: TOKEN }],
      sigDeadline: "4102444800",
      spender: POSITION_MANAGER,
    },
    primaryType: "PermitBatch" as const,
    typedDataHash: HASH,
  };
  const nftPermit = {
    domain: {
      chainId: 4663,
      name: "Uniswap V4 Positions NFT" as const,
      verifyingContract: POSITION_MANAGER,
    },
    expectedSigner: TOKEN,
    finalActionId: `uniswap-v4:${kind}:1`,
    kind: "nftPermitSignature" as const,
    message: { deadline: "4102444800", nonce: "0", spender: ACCOUNT, tokenId: "1" },
    primaryType: "Permit" as const,
    sourceNft: { nonce: "0", operator: ACCOUNT, owner: TOKEN, tokenId: "1" },
    typedDataHash: HASH,
    types: { Permit: [{ name: "spender", type: "address" }] },
    unsignedFinal,
  };
  const actions =
    kind === "mint" || kind === "increase"
      ? [approval, permit, positionManager]
      : delegated
        ? [nftPermit, positionManager]
        : [positionManager];
  const deployment = {
    chainId: 4663,
    permit2: PERMIT2,
    poolManager: "0x4444444444444444444444444444444444444444",
    positionManager: POSITION_MANAGER,
    stateView: "0x5555555555555555555555555555555555555555",
  } as const;
  const candidate = uniswapV4PersistedWritePlanSchema.parse({
    account: ACCOUNT,
    actions,
    deployment,
    deploymentHash: hashUniswapV4Deployment(deployment),
    expectedDeltas: {
      kind,
      liquidityDelta: kind === "collect" ? "0" : "1",
      nativeValueDelta: "0",
      token0Delta: "0",
      token1Delta: "0",
    },
    operation: operation(kind),
    planHash: HASH,
    poolId: HASH,
    sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
    version: 1,
  });
  return uniswapV4PersistedWritePlanSchema.parse({
    ...candidate,
    planHash: hashUniswapV4WritePlan(candidate),
  });
}
