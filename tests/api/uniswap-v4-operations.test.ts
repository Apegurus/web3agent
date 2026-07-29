import { describe, expect, it } from "vitest";

import { transactionFacts } from "../../src/api/operations/uniswap-v4-resume-state.js";
import { acceptSignature } from "../../src/api/operations/uniswap-v4-signature-validation.js";
import { uniswapV4ProgressSchema } from "../../src/api/schemas/uniswap-v4/lifecycle.js";
import { uniswapV4PersistedWritePlanSchema } from "../../src/tools/uniswap-v4/write-schemas.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const POSITION_MANAGER = "0x3333333333333333333333333333333333333333";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const HASH = `0x${"aa".repeat(32)}`;

describe("Uniswap v4 external lifecycle transitions", () => {
  it("Given a Permit2 submission before PositionManager When reading final transaction facts Then selects the persisted final action", () => {
    const plan = uniswapV4PersistedWritePlanSchema.parse({
      account: ACCOUNT,
      actions: [
        {
          domain: { chainId: 4663, name: "Permit2", verifyingContract: PERMIT2 },
          kind: "permit2Signature",
          message: {
            details: [{ amount: "1", expiration: "4102444800", nonce: "0", token: TOKEN }],
            sigDeadline: "4102444800",
            spender: POSITION_MANAGER,
          },
          primaryType: "PermitBatch",
          typedDataHash: HASH,
        },
        {
          data: "0xdeadbeef",
          dataHash: HASH,
          kind: "positionManager",
          to: POSITION_MANAGER,
          value: "0",
        },
      ],
      deployment: {
        chainId: 4663,
        permit2: PERMIT2,
        poolManager: "0x4444444444444444444444444444444444444444",
        positionManager: POSITION_MANAGER,
        stateView: "0x5555555555555555555555555555555555555555",
      },
      deploymentHash: HASH,
      expectedDeltas: {
        kind: "increase",
        liquidityDelta: "1",
        nativeValueDelta: "0",
        token0Delta: "-1",
        token1Delta: "-1",
      },
      operation: {
        account: ACCOUNT,
        amount0Max: "1",
        amount1Max: "1",
        chainId: 4663,
        deadline: "4102444800",
        hookData: "0x",
        kind: "increase",
        liquidity: "1",
        poolKey: {
          currency0: {
            address: ACCOUNT,
            chainId: 4663,
            decimals: 18,
            kind: "erc20",
            name: "A",
            symbol: "A",
          },
          currency1: {
            address: TOKEN,
            chainId: 4663,
            decimals: 18,
            kind: "erc20",
            name: "B",
            symbol: "B",
          },
          fee: 500,
          hooks: "0x0000000000000000000000000000000000000000",
          tickSpacing: 60,
        },
        slippageBps: 0,
        sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
        tickLower: -60,
        tickUpper: 60,
        tokenId: "1",
      },
      planHash: HASH,
      poolId: HASH,
      sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
      version: 1,
    });
    const progress = uniswapV4ProgressSchema.parse({
      completed: {},
      derivedTransactions: {},
      nextActionIndex: 2,
    });

    expect(transactionFacts(plan, "uniswap-v4:increase:1")).toMatchObject({
      data: "0xdeadbeef",
      dataHash: HASH,
      to: POSITION_MANAGER,
      value: "0",
    });
  });

  it("Given a persisted Permit2 action with a forged digest When accepting its signature Then rejects before live-state or signer checks", async () => {
    const plan = uniswapV4PersistedWritePlanSchema.parse({
      account: ACCOUNT,
      actions: [
        {
          domain: { chainId: 4663, name: "Permit2", verifyingContract: PERMIT2 },
          kind: "permit2Signature",
          message: {
            details: [{ amount: "1", expiration: "4102444800", nonce: "0", token: TOKEN }],
            sigDeadline: "4102444800",
            spender: POSITION_MANAGER,
          },
          primaryType: "PermitBatch",
          typedDataHash: HASH,
        },
        {
          data: "0xdeadbeef",
          dataHash: HASH,
          kind: "positionManager",
          to: POSITION_MANAGER,
          value: "0",
        },
      ],
      deployment: {
        chainId: 4663,
        permit2: PERMIT2,
        poolManager: "0x4444444444444444444444444444444444444444",
        positionManager: POSITION_MANAGER,
        stateView: "0x5555555555555555555555555555555555555555",
      },
      deploymentHash: HASH,
      expectedDeltas: {
        kind: "increase",
        liquidityDelta: "1",
        nativeValueDelta: "0",
        token0Delta: "-1",
        token1Delta: "-1",
      },
      operation: {
        account: ACCOUNT,
        amount0Max: "1",
        amount1Max: "1",
        chainId: 4663,
        deadline: "4102444800",
        hookData: "0x",
        kind: "increase",
        liquidity: "1",
        poolKey: {
          currency0: {
            address: ACCOUNT,
            chainId: 4663,
            decimals: 18,
            kind: "erc20",
            name: "A",
            symbol: "A",
          },
          currency1: {
            address: TOKEN,
            chainId: 4663,
            decimals: 18,
            kind: "erc20",
            name: "B",
            symbol: "B",
          },
          fee: 500,
          hooks: "0x0000000000000000000000000000000000000000",
          tickSpacing: 60,
        },
        slippageBps: 0,
        sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
        tickLower: -60,
        tickUpper: 60,
        tokenId: "1",
      },
      planHash: HASH,
      poolId: HASH,
      sourceBlock: { blockHash: HASH, blockNumber: "1", chainId: 4663 },
      version: 1,
    });
    const action = plan.actions[0];
    if (action?.kind !== "permit2Signature") throw new Error("fixture action must be Permit2");

    await expect(acceptSignature(plan, action, `0x${"11".repeat(65)}`)).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "Uniswap v4 typed-data payload hash mismatch",
    });
  });
});
