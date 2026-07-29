import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4Reconciliation } from "../api/types.js";
import type { UniswapV4PersistedWritePlan } from "../tools/uniswap-v4/write-schemas.js";
import {
  type ConfirmedReceipt,
  assertUniswapV4FinalReceipt,
  decodeConfirmedUniswapV4Events,
  observedUniswapV4LiquidityDelta,
} from "./reconcile-confirmed-receipt.js";
import { observeUniswapV4PostState } from "./reconcile-confirmed-state.js";
import { compareUniswapV4ExpectedDeltas } from "./reconcile.js";

export type { ConfirmedReceipt } from "./reconcile-confirmed-receipt.js";

export async function reconcileUniswapV4ConfirmedReceipt(input: {
  readonly plan: UniswapV4PersistedWritePlan;
  readonly receipt: ConfirmedReceipt;
}): Promise<UniswapV4Reconciliation> {
  assertUniswapV4FinalReceipt(input.plan, input.receipt);
  const receiptBlock = {
    blockHash: input.receipt.blockHash,
    blockNumber: input.receipt.blockNumber.toString(),
    chainId: input.plan.operation.chainId,
  };
  const decodedEvents = decodeConfirmedUniswapV4Events(input.plan, input.receipt.logs);
  const postState = await observeUniswapV4PostState({
    plan: input.plan,
    receiptBlock,
    receiptLogs: input.receipt.logs,
  });
  const actualDeltas = {
    kind: input.plan.expectedDeltas.kind,
    liquidityDelta: observedUniswapV4LiquidityDelta(decodedEvents),
    nativeValueDelta: {
      reason: "native balance deltas include gas paid and cannot be compared to planner value",
      status: "unavailable" as const,
    },
    token0Delta: postState.tokenBalances[0].value,
    token1Delta: postState.tokenBalances[1].value,
  };
  return {
    actualDeltas,
    decodedEvents: [...decodedEvents],
    expectedDeltas: input.plan.expectedDeltas,
    matchesExpected: comparisonValue(
      compareUniswapV4ExpectedDeltas({ actual: actualDeltas, expected: input.plan.expectedDeltas })
    ),
    postState: {
      pool: postState.pool,
      position: postState.position,
      tokenBalances: postState.tokenBalances.map(({ currency, value }) => ({ currency, value })),
    },
    receipt: {
      block: receiptBlock,
      status: "success",
      to: input.plan.deployment.positionManager,
      transactionHash: input.receipt.transactionHash,
    },
    receiptBlock,
    receiptHash: input.receipt.transactionHash,
    sourceBlock: input.plan.sourceBlock,
  };
}

export function assertUniswapV4ReconciliationComplete(
  reconciliation: UniswapV4Reconciliation
): void {
  assertAvailable(
    reconciliation.postState.pool,
    "pool",
    "Uniswap v4 reconciliation could not reread pool state at the canonical receipt block"
  );
  if (reconciliation.expectedDeltas.kind !== "burn") {
    assertAvailable(
      reconciliation.postState.position,
      "position",
      "Uniswap v4 reconciliation could not reread position state at the canonical receipt block"
    );
  }
}

function assertAvailable(
  value: { readonly reason?: string; readonly status: "available" | "unavailable" },
  component: "pool" | "position",
  message: string
): void {
  if (value.status === "unavailable") {
    throw new Web3AgentError({
      code: "UNISWAP_V4_RECONCILIATION_INCOMPLETE",
      details: { component, reason: value.reason },
      message,
    });
  }
}

function comparisonValue(comparison: ReturnType<typeof compareUniswapV4ExpectedDeltas>) {
  switch (comparison.status) {
    case "matched":
      return {
        matchesExpected: true as const,
        mismatches: [...comparison.mismatches],
        status: "matched" as const,
        unavailable: [...comparison.unavailable],
      };
    case "mismatched":
      return {
        matchesExpected: false as const,
        mismatches: [...comparison.mismatches],
        status: "mismatched" as const,
        unavailable: [...comparison.unavailable],
      };
    case "unavailable":
      return {
        matchesExpected: null,
        mismatches: [...comparison.mismatches],
        status: "unavailable" as const,
        unavailable: [...comparison.unavailable],
      };
  }
}
