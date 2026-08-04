import { actionId } from "../api/operations/uniswap-v4-resume-state.js";
import {
  uniswapV4SimulationInputSchema,
  uniswapV4SimulationResultSchema,
} from "../api/schemas/uniswap-v4/simulation.js";
import { simulateTransaction } from "../api/simulation.js";
import { NATIVE_ASSET_ADDRESS } from "../api/simulation/fallback-decoder.js";
import type {
  BalanceChange,
  UniswapV4LifecycleOperation,
  UniswapV4SimulationInput,
  UniswapV4SimulationResult,
} from "../api/types.js";
import { prepareExternalUniswapV4WritePlan } from "../tools/uniswap-v4/write-planner.js";
import type { UniswapV4PersistedWritePlan } from "../tools/uniswap-v4/write-schemas.js";
import {
  type UniswapV4ObservedDeltas,
  type UniswapV4SimulatedTransaction,
  type UniswapV4SimulationTransaction,
  type UniswapV4StageSimulationBackend,
  compareUniswapV4ExpectedDeltas,
  simulateUniswapV4Stages,
} from "./reconcile.js";

export type UniswapV4OperationSimulationBackend = {
  readonly applyPriorStage?: (input: {
    readonly operation: UniswapV4LifecycleOperation;
    readonly stage: UniswapV4SimulationTransaction;
  }) => Promise<boolean>;
  readonly simulate: (input: {
    readonly operation: UniswapV4LifecycleOperation;
    readonly stage: UniswapV4SimulationTransaction;
  }) => Promise<UniswapV4SimulatedTransaction>;
};

export async function simulateUniswapV4OperationPlan(
  rawInput: UniswapV4SimulationInput,
  backend?: UniswapV4OperationSimulationBackend
): Promise<UniswapV4SimulationResult> {
  const input = uniswapV4SimulationInputSchema.parse(rawInput);
  const plan = await prepareExternalUniswapV4WritePlan(input.operation);
  const comparisons = new Map<string, ReturnType<typeof comparisonValue>>();
  const simulationBackend = backend ?? defaultSimulationBackend(input.operation);
  const result = await simulateUniswapV4Stages({
    actions: simulationTransactions(plan),
    backend: stageSimulationBackend(
      input.operation,
      simulationBackend,
      comparisons,
      plan.expectedDeltas
    ),
  });
  return uniswapV4SimulationResultSchema.parse({
    ...result,
    sourceBlock: input.sourceBlock,
    stages: result.stages.map((stage) => withTraceComparison(stage, comparisons)),
  });
}

function defaultSimulationBackend(
  operation: UniswapV4LifecycleOperation
): UniswapV4OperationSimulationBackend {
  return {
    simulate: async ({ stage }) =>
      simulateTransaction({
        chainId: operation.chainId,
        data: stage.data,
        from: operation.account,
        to: stage.to,
        value: stage.value,
      }),
  };
}

function stageSimulationBackend(
  operation: UniswapV4LifecycleOperation,
  backend: UniswapV4OperationSimulationBackend,
  comparisons: Map<string, ReturnType<typeof comparisonValue>>,
  expectedDeltas: UniswapV4PersistedWritePlan["expectedDeltas"]
): UniswapV4StageSimulationBackend {
  return {
    ...(backend.applyPriorStage === undefined
      ? {}
      : {
          applyPriorStage: async (stage) =>
            backend.applyPriorStage?.({ operation, stage }) ?? false,
        }),
    simulate: async (stage) => {
      const simulation = await backend.simulate({ operation, stage });
      if (simulation.balanceChangesSource === "trace") {
        comparisons.set(
          stage.id,
          comparisonValue(
            compareUniswapV4ExpectedDeltas({
              actual: observedTraceDeltas(operation, simulation.balanceChanges),
              expected: expectedDeltas,
            })
          )
        );
      }
      return simulation;
    },
  };
}

function simulationTransactions(
  plan: UniswapV4PersistedWritePlan
): readonly UniswapV4SimulationTransaction[] {
  const transactions: UniswapV4SimulationTransaction[] = [];
  let authorizationId: string | undefined;

  for (const [index, action] of plan.actions.entries()) {
    const id = actionId(plan, index);
    switch (action.kind) {
      case "permit2Signature":
      case "nftPermitSignature":
        authorizationId = id;
        break;
      case "erc20Approval":
      case "poolInitialization":
        transactions.push({
          data: action.data,
          id,
          kind: action.kind,
          to: action.to,
          value: action.value,
        });
        break;
      case "positionManager":
        transactions.push({
          data: action.data,
          id,
          kind: action.kind,
          ...(authorizationId === undefined ? {} : { requires: authorizationId }),
          to: action.to,
          value: action.value,
        });
        break;
    }
  }

  return transactions;
}

function observedTraceDeltas(
  operation: UniswapV4LifecycleOperation,
  changes: readonly BalanceChange[]
): UniswapV4ObservedDeltas {
  const currency0 = traceDelta(operation.poolKey.currency0, changes);
  const currency1 = traceDelta(operation.poolKey.currency1, changes);
  return {
    kind: operation.kind,
    liquidityDelta: {
      reason: "call traces do not expose PositionManager liquidity state",
      status: "unavailable",
    },
    nativeValueDelta:
      operation.poolKey.currency0.kind === "native"
        ? currency0
        : operation.poolKey.currency1.kind === "native"
          ? currency1
          : { reason: "operation has no traced native currency", status: "unavailable" },
    token0Delta: currency0,
    token1Delta: currency1,
  };
}

function traceDelta(
  currency: UniswapV4LifecycleOperation["poolKey"]["currency0"],
  changes: readonly BalanceChange[]
) {
  const token = currency.kind === "native" ? NATIVE_ASSET_ADDRESS : currency.address;
  const matching = changes.filter((change) => change.token.toLowerCase() === token.toLowerCase());
  if (matching.length === 0) {
    return {
      reason: "trace did not emit a balance change for this pool currency",
      status: "unavailable" as const,
    };
  }
  const total = matching.reduce(
    (sum, change) =>
      sum + (change.direction === "in" ? BigInt(change.amount) : -BigInt(change.amount)),
    0n
  );
  return { status: "available" as const, value: total.toString() };
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

function withTraceComparison(
  stage: Awaited<ReturnType<typeof simulateUniswapV4Stages>>["stages"][number],
  comparisons: ReadonlyMap<string, ReturnType<typeof comparisonValue>>
) {
  const comparison = comparisons.get(stage.id);
  return stage.status === "succeeded" && comparison !== undefined
    ? { ...stage, traceComparison: comparison }
    : stage;
}
