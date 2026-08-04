import { describe, expect, it } from "vitest";

import {
  prepareOperationSchema,
  uniswapV4DeploymentSchema,
  uniswapV4EventQuerySchema,
  uniswapV4LifecycleOperationSchema,
  uniswapV4OperationResumeStateSchema,
  uniswapV4PoolKeySchema,
  uniswapV4PositionStateSchema,
  uniswapV4SimulationResultSchema,
} from "../../src/api/schemas.js";

const NATIVE_ETH = {
  kind: "native",
  chainId: 4663,
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
};

const USDG = {
  kind: "erc20",
  chainId: 4663,
  address: "0x0000000000000000000000000000000000000002",
  symbol: "USDG",
  name: "USDG",
  decimals: 6,
};

const dynamicFeePoolKey = {
  currency0: NATIVE_ETH,
  currency1: USDG,
  fee: 8_388_608,
  tickSpacing: 60,
  hooks: "0x0000000000000000000000000000000000000003",
};

const sourceBlock = {
  chainId: 4663,
  blockNumber: "123456",
  blockHash: `0x${"11".repeat(32)}`,
};

function operationFor(kind: "mint" | "increase" | "decrease" | "collect" | "burn") {
  const base = {
    account: "0x0000000000000000000000000000000000000001",
    chainId: 4663,
    deadline: "1735689600",
    hookData: "0x",
    poolKey: dynamicFeePoolKey,
    sourceBlock,
  };
  if (kind === "mint")
    return {
      ...base,
      amount0Max: "1",
      amount1Max: "1",
      createPool: false,
      kind,
      liquidity: "1",
      tickLower: -120,
      tickUpper: 120,
    };
  if (kind === "increase")
    return {
      ...base,
      amount0Max: "1",
      amount1Max: "1",
      kind,
      liquidity: "1",
      tickLower: -120,
      tickUpper: 120,
      tokenId: "1",
    };
  if (kind === "collect") return { ...base, kind, recipient: base.account, tokenId: "1" };
  return {
    ...base,
    amount0Min: "0",
    amount1Min: "0",
    kind,
    liquidity: "1",
    liquidityBps: kind === "burn" ? 10000 : 1,
    recipient: base.account,
    tokenId: "1",
  };
}

describe("Uniswap v4 public schemas", () => {
  it("Given a native/ERC-20 hooked dynamic-fee pool When parsing its PoolKey Then it preserves the canonical identity", () => {
    expect(uniswapV4PoolKeySchema.parse(dynamicFeePoolKey)).toMatchObject({
      fee: 8_388_608,
    });
  });

  it("Given hook data attached to a PoolKey When parsing Then the protocol identity rejects it while operation hookData remains valid", () => {
    expect(
      uniswapV4PoolKeySchema.safeParse({ ...dynamicFeePoolKey, hookData: "0x1234" }).success
    ).toBe(false);
    expect(
      uniswapV4LifecycleOperationSchema.safeParse({
        kind: "mint",
        chainId: 4663,
        scope: "pool",
        account: "0x0000000000000000000000000000000000000001",
        poolKey: dynamicFeePoolKey,
        hookData: "0x1234",
        deadline: "1735689600",
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1",
        amount0Max: "1",
        amount1Max: "1",
        createPool: false,
      }).success
    ).toBe(true);
  });

  it("Given every lifecycle kind When parsing its public input Then each discriminant is accepted", () => {
    const common = {
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x1234",
      deadline: "1735689600",
      sourceBlock,
    };

    const operations = [
      {
        ...common,
        kind: "mint",
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1000000",
        amount0Max: "1000000000000000",
        amount1Max: "1000000",
        createPool: false,
      },
      {
        ...common,
        kind: "increase",
        tokenId: "1",
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1000000",
        amount0Max: "1000000000000000",
        amount1Max: "1000000",
      },
      {
        ...common,
        kind: "decrease",
        tokenId: "1",
        liquidity: "250000",
        liquidityBps: 2500,
        amount0Min: "1",
        amount1Min: "1",
      },
      {
        ...common,
        kind: "collect",
        tokenId: "1",
        recipient: "0x0000000000000000000000000000000000000001",
      },
      {
        ...common,
        kind: "burn",
        tokenId: "1",
        liquidity: "1000000",
        liquidityBps: 10000,
        amount0Min: "1",
        amount1Min: "1",
      },
    ];

    for (const operation of operations) {
      expect(uniswapV4LifecycleOperationSchema.safeParse(operation).success).toBe(true);
    }
  });

  it("Given every v4 lifecycle input When preparing a walletless operation Then the generic boundary preserves its uniswap-v4 discriminator", () => {
    const common = {
      integration: "uniswap-v4" as const,
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x",
      deadline: "1735689600",
      sourceBlock,
    };
    const operations = [
      {
        ...common,
        kind: "mint" as const,
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1000000",
        amount0Max: "1000000000000000",
        amount1Max: "1000000",
        createPool: false,
      },
      {
        ...common,
        kind: "increase" as const,
        tokenId: "1",
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1000000",
        amount0Max: "1000000000000000",
        amount1Max: "1000000",
      },
      {
        ...common,
        kind: "decrease" as const,
        tokenId: "1",
        liquidity: "250000",
        liquidityBps: 2500,
        amount0Min: "1",
        amount1Min: "1",
      },
      {
        ...common,
        kind: "collect" as const,
        tokenId: "1",
        recipient: "0x0000000000000000000000000000000000000001",
      },
      {
        ...common,
        kind: "burn" as const,
        tokenId: "1",
        liquidity: "1000000",
        liquidityBps: 10000,
        amount0Min: "1",
        amount1Min: "1",
      },
    ];

    for (const operation of operations) {
      const parsed = prepareOperationSchema.safeParse(operation);
      expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(
        true
      );
    }
  });

  it("Given every lifecycle kind When parsing a resumable state Then its serializable facts are accepted", () => {
    for (const kind of ["mint", "increase", "decrease", "collect", "burn"] as const) {
      expect(
        uniswapV4OperationResumeStateSchema.safeParse({
          version: 1,
          integration: "uniswap-v4",
          kind,
          state: {
            chainId: 4663,
            operationId: `op-${kind}`,
            sourceBlock,
            actionIds: ["approval", "position-manager"],
            expectedDeltas: {
              kind,
              token0Delta: "-1",
              token1Delta: "2",
              liquidityDelta: "1",
              nativeValueDelta: "-1",
            },
            operation: operationFor(kind),
            typedDataHashes: [],
            plan: {},
            progress: { completed: {}, nextActionIndex: 0 },
            stateVersion: 3,
            actionResults: {},
          },
        }).success
      ).toBe(true);
    }
  });

  it("Given lifecycle and resume payloads with a mismatched chain When parsing Then the shared boundary rejects the inconsistency", () => {
    const common = {
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x1234",
      deadline: "1735689600",
      tickLower: -120,
      tickUpper: 120,
      liquidity: "1000000",
      amount0Max: "1000000000000000",
      amount1Max: "1000000",
      createPool: false,
      kind: "mint" as const,
    };
    const topLevelMismatch = uniswapV4LifecycleOperationSchema.safeParse({
      ...common,
      chainId: 1,
      sourceBlock,
    });
    const blockMismatch = uniswapV4LifecycleOperationSchema.safeParse({
      ...common,
      chainId: 4663,
      sourceBlock: { ...sourceBlock, chainId: 1 },
    });
    const resumeMismatch = uniswapV4OperationResumeStateSchema.safeParse({
      version: 1,
      integration: "uniswap-v4",
      kind: "mint",
      state: {
        chainId: 1,
        operationId: "op-mint",
        sourceBlock,
        actionIds: ["approval", "position-manager"],
        expectedDeltas: {
          kind: "mint",
          token0Delta: "-1",
          token1Delta: "2",
          liquidityDelta: "1",
          nativeValueDelta: "-1",
        },
        operation: { ...operationFor("mint"), chainId: 1 },
        typedDataHashes: [],
        plan: {},
        progress: { completed: {}, nextActionIndex: 0 },
        stateVersion: 3,
        actionResults: {},
      },
    });

    expect(topLevelMismatch.success).toBe(false);
    expect(blockMismatch.success).toBe(false);
    expect(resumeMismatch.success).toBe(false);
    if (topLevelMismatch.success || blockMismatch.success || resumeMismatch.success) {
      throw new Error("cross-chain fixtures must fail schema parsing");
    }
    expect(topLevelMismatch.error.issues.map((issue) => issue.path.join("."))).toContain(
      "poolKey.currency0.chainId"
    );
    expect(blockMismatch.error.issues.map((issue) => issue.path.join("."))).toContain(
      "sourceBlock.chainId"
    );
    expect(resumeMismatch.error.issues.map((issue) => issue.path.join("."))).toContain(
      "state.sourceBlock.chainId"
    );
  });

  it("Given deployment and position state with a cross-chain source block When parsing Then the factual chain boundary rejects it", () => {
    const deploymentMismatch = uniswapV4DeploymentSchema.safeParse({
      chainId: 4663,
      poolManager: "0x0000000000000000000000000000000000000004",
      positionManager: "0x0000000000000000000000000000000000000005",
      stateView: "0x0000000000000000000000000000000000000006",
      permit2: "0x0000000000000000000000000000000000000007",
      verifiedAt: { ...sourceBlock, chainId: 1 },
      poolManagerCodeHash: `0x${"12".repeat(32)}`,
      positionManagerCodeHash: `0x${"13".repeat(32)}`,
      stateViewCodeHash: `0x${"14".repeat(32)}`,
      permit2CodeHash: `0x${"15".repeat(32)}`,
      sourceReferences: ["https://example.com/deployment"],
    });
    const positionMismatch = uniswapV4PositionStateSchema.safeParse({
      sourceBlock: { ...sourceBlock, chainId: 1 },
      tokenId: "1",
      owner: "0x0000000000000000000000000000000000000001",
      operator: "0x0000000000000000000000000000000000000001",
      pool: { poolId: `0x${"22".repeat(32)}`, poolKey: dynamicFeePoolKey },
      tickLower: -120,
      tickUpper: 120,
      liquidity: "1",
      tokensOwed0: "0",
      tokensOwed1: "0",
      feeGrowthInside0LastX128: "0",
      feeGrowthInside1LastX128: "0",
      amount0: "0",
      amount1: "0",
      uncollectedFees0: "0",
      uncollectedFees1: "0",
    });

    expect(deploymentMismatch.success).toBe(false);
    expect(positionMismatch.success).toBe(false);
  });

  it("Given bounded event criteria When parsing a request Then a versioned cursor is accepted", () => {
    expect(
      uniswapV4EventQuerySchema.safeParse({
        chainId: 4663,
        scope: "pool",
        poolId: `0x${"22".repeat(32)}`,
        startBlock: "100",
        endBlock: "200",
        pageSize: 100,
        cursor: "v2:eyJwYWdlIjoyfQ",
      }).success
    ).toBe(true);
  });

  it("Given scoped event history inputs When parsing Then exactly one safe identifier and compatible kinds are required", () => {
    const base = { chainId: 4663, endBlock: "200", pageSize: 10, startBlock: "100" };
    expect(
      uniswapV4EventQuerySchema.safeParse({
        ...base,
        scope: "pool",
        poolId: `0x${"22".repeat(32)}`,
      }).success
    ).toBe(true);
    expect(
      uniswapV4EventQuerySchema.safeParse({ ...base, scope: "position", tokenId: "7" }).success
    ).toBe(true);
    expect(
      uniswapV4EventQuerySchema.safeParse({ ...base, scope: "pool", tokenId: "7" }).success
    ).toBe(false);
    expect(
      uniswapV4EventQuerySchema.safeParse({
        ...base,
        scope: "position",
        poolId: `0x${"22".repeat(32)}`,
      }).success
    ).toBe(false);
    expect(
      uniswapV4EventQuerySchema.safeParse({
        ...base,
        scope: "pool",
        poolId: `0x${"22".repeat(32)}`,
        tokenId: "7",
      }).success
    ).toBe(false);
    expect(
      uniswapV4EventQuerySchema.safeParse({
        ...base,
        scope: "pool",
        poolId: `0x${"22".repeat(32)}`,
        eventKinds: ["positionTransfer"],
      }).success
    ).toBe(false);
  });

  it("Given a simulated operation with a blocked prerequisite When parsing its reconciliation Then it cannot claim success", () => {
    expect(
      uniswapV4SimulationResultSchema.safeParse({
        sourceBlock,
        stages: [
          {
            id: "position-manager",
            status: "blocked_by_prerequisite",
            blockedBy: "approval",
          },
        ],
        success: false,
      }).success
    ).toBe(true);
  });

  it("Given field-specific malformed payloads When parsing Then each invalid boundary is rejected", () => {
    const unordered = uniswapV4PoolKeySchema.safeParse({
      ...dynamicFeePoolKey,
      currency0: USDG,
      currency1: NATIVE_ETH,
    });
    const invalidTicks = uniswapV4LifecycleOperationSchema.safeParse({
      kind: "mint",
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x",
      deadline: "1735689600",
      sourceBlock,
      tickLower: -119,
      tickUpper: 120,
      liquidity: "1",
      amount0Max: "1",
      amount1Max: "1",
      createPool: false,
    });
    const rejectedCollectCaps = uniswapV4LifecycleOperationSchema.safeParse({
      kind: "collect",
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x",
      deadline: "1735689600",
      sourceBlock,
      tokenId: "1",
      recipient: "0x0000000000000000000000000000000000000001",
      amount0Max: "1",
      amount1Max: "1",
    });
    const unboundedEvents = uniswapV4EventQuerySchema.safeParse({
      chainId: 4663,
      poolId: `0x${"22".repeat(32)}`,
      startBlock: "1",
      endBlock: "10002",
      pageSize: 1,
    });
    const malformedCursor = uniswapV4EventQuerySchema.safeParse({
      chainId: 4663,
      poolId: `0x${"22".repeat(32)}`,
      startBlock: "1",
      endBlock: "2",
      pageSize: 1,
      cursor: "not-a-versioned-cursor",
    });
    const malformedHookData = uniswapV4LifecycleOperationSchema.safeParse({
      kind: "collect",
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "not-hex",
      deadline: "1735689600",
      sourceBlock,
      tokenId: "1",
      recipient: "0x0000000000000000000000000000000000000001",
    });
    const partialBurn = uniswapV4LifecycleOperationSchema.safeParse({
      kind: "burn",
      chainId: 4663,
      account: "0x0000000000000000000000000000000000000001",
      poolKey: dynamicFeePoolKey,
      hookData: "0x",
      deadline: "1735689600",
      sourceBlock,
      tokenId: "1",
      liquidity: "1",
      liquidityBps: 9999,
      amount0Min: "1",
      amount1Min: "1",
    });
    const unknownKind = uniswapV4LifecycleOperationSchema.safeParse({ kind: "rebalance" });

    for (const result of [
      unordered,
      invalidTicks,
      rejectedCollectCaps,
      unboundedEvents,
      malformedCursor,
      malformedHookData,
      partialBurn,
      unknownKind,
    ]) {
      expect(result.success).toBe(false);
    }
  });
});
