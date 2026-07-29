import type { Address, Hex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4Event } from "../api/types.js";
import type { UniswapV4PersistedWritePlan } from "../tools/uniswap-v4/write-schemas.js";
import { decodeUniswapV4ReceiptEvents } from "./reconcile-receipt.js";
import type { UniswapV4ObservedDelta } from "./reconcile.js";

export type ConfirmedReceipt = {
  readonly blockHash: Hex;
  readonly blockNumber: bigint;
  readonly logs: readonly ReceiptLog[];
  readonly status: "success" | "reverted";
  readonly to: Address | null;
  readonly transactionHash: Hex;
};

type ReceiptLog = {
  readonly address: Address;
  readonly blockNumber: bigint | null;
  readonly data: Hex;
  readonly logIndex: number | null;
  readonly topics: readonly Hex[];
  readonly transactionHash: Hex | null;
  readonly transactionIndex: number | null;
};

export function assertUniswapV4FinalReceipt(
  plan: UniswapV4PersistedWritePlan,
  receipt: ConfirmedReceipt
): void {
  if (receipt.status !== "success") {
    throw new Web3AgentError({
      code: "UNISWAP_V4_RECEIPT_REVERTED",
      message: "Uniswap v4 reconciliation requires a successful final receipt",
    });
  }
  if (receipt.to?.toLowerCase() !== plan.deployment.positionManager.toLowerCase()) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_RECEIPT_TARGET_MISMATCH",
      message: "Uniswap v4 reconciliation receipt target is not the canonical PositionManager",
    });
  }
}

export function decodeConfirmedUniswapV4Events(
  plan: UniswapV4PersistedWritePlan,
  logs: readonly ReceiptLog[]
): readonly UniswapV4Event[] {
  const tokenId = positionTokenId(plan, logs);
  return decodeUniswapV4ReceiptEvents({
    deployment: plan.deployment,
    logs: receiptLogs(logs),
    poolId: plan.poolId,
    ...(tokenId === undefined ? {} : { tokenId }),
  });
}

export function observedUniswapV4LiquidityDelta(
  events: readonly UniswapV4Event[]
): UniswapV4ObservedDelta {
  const deltas = events.filter((event) => event.kind === "positionModify");
  if (deltas.length === 0) {
    return {
      reason: "receipt did not emit a matching PositionManager ModifyPosition event",
      status: "unavailable",
    };
  }
  return {
    status: "available",
    value: deltas.reduce((total, event) => total + BigInt(event.liquidityDelta), 0n).toString(),
  };
}

export function positionTokenId(
  plan: UniswapV4PersistedWritePlan,
  logs: readonly ReceiptLog[]
): string | undefined {
  if ("tokenId" in plan.operation) return plan.operation.tokenId;
  for (const event of decodeConfirmedUniswapV4EventsWithoutToken(plan, logs)) {
    if (event.kind === "positionLifecycle" && event.action === "mint") return event.tokenId;
  }
  return undefined;
}

export function receiptLogs(logs: readonly ReceiptLog[]) {
  return logs.flatMap((log) => {
    const [firstTopic, ...remainingTopics] = log.topics;
    if (
      firstTopic === undefined ||
      log.blockNumber === null ||
      log.logIndex === null ||
      log.transactionHash === null ||
      log.transactionIndex === null
    ) {
      return [];
    }
    return [
      {
        ...log,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        topics: [firstTopic, ...remainingTopics],
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
      },
    ];
  });
}

function decodeConfirmedUniswapV4EventsWithoutToken(
  plan: UniswapV4PersistedWritePlan,
  logs: readonly ReceiptLog[]
): readonly UniswapV4Event[] {
  return decodeUniswapV4ReceiptEvents({
    deployment: plan.deployment,
    logs: receiptLogs(logs),
    poolId: plan.poolId,
  });
}
