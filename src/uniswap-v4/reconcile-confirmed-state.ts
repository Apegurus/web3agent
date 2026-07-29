import type { Hex } from "viem";

import { toPublicUniswapV4Deployment } from "../tools/uniswap-v4/write-planner.js";
import type { UniswapV4PersistedWritePlan } from "../tools/uniswap-v4/write-schemas.js";
import { createUniswapV4ReadClient } from "./client.js";
import { observeUniswapV4TokenBalances } from "./reconcile-balances.js";
import { positionTokenId } from "./reconcile-confirmed-receipt.js";
import { createUniswapV4StateReader } from "./state.js";

export type ReconciliationReceiptBlock = {
  readonly blockHash: Hex;
  readonly blockNumber: string;
  readonly chainId: number;
};

export async function observeUniswapV4PostState(input: {
  readonly plan: UniswapV4PersistedWritePlan;
  readonly receiptBlock: ReconciliationReceiptBlock;
  readonly receiptLogs: Parameters<typeof positionTokenId>[1];
}) {
  const reader = createUniswapV4StateReader({
    deployment: toPublicUniswapV4Deployment(input.plan.deployment),
    readClient: createUniswapV4ReadClient({
      chainId: input.plan.operation.chainId,
      deployment: input.plan.deployment,
    }),
  });
  const [pool, position, tokenBalances] = await Promise.all([
    observe(() =>
      reader.readPoolSnapshot({
        poolKey: input.plan.operation.poolKey,
        sourceBlock: input.receiptBlock,
      })
    ),
    observePosition(reader, input.plan, input.receiptBlock, input.receiptLogs),
    observeUniswapV4TokenBalances(input.plan, input.receiptBlock.blockNumber),
  ]);
  return { pool, position, tokenBalances };
}

async function observePosition(
  reader: ReturnType<typeof createUniswapV4StateReader>,
  plan: UniswapV4PersistedWritePlan,
  receiptBlock: ReconciliationReceiptBlock,
  logs: Parameters<typeof positionTokenId>[1]
) {
  if (plan.operation.kind === "burn") {
    return {
      reason: "burned positions have no post-receipt position state",
      status: "unavailable" as const,
    };
  }
  const tokenId = positionTokenId(plan, logs);
  if (tokenId === undefined) {
    return {
      reason: "receipt did not emit a minted position token ID",
      status: "unavailable" as const,
    };
  }
  return observe(() =>
    reader.readPositionSnapshot({
      poolKey: plan.operation.poolKey,
      sourceBlock: receiptBlock,
      tokenId,
    })
  );
}

async function observe<T>(read: () => Promise<T>) {
  try {
    return { status: "available" as const, value: await read() };
  } catch (error: unknown) {
    return {
      reason: error instanceof Error ? error.message : "state read failed",
      status: "unavailable" as const,
    };
  }
}
