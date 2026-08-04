import type { Address } from "viem";

import type { SimulationResult, UniswapV4ExpectedDeltas } from "../api/types.js";

export type UniswapV4ObservedDelta =
  | { readonly status: "available"; readonly value: string }
  | { readonly reason: string; readonly status: "unavailable" };

export type UniswapV4ObservedDeltas = {
  readonly kind: UniswapV4ExpectedDeltas["kind"];
  readonly liquidityDelta: UniswapV4ObservedDelta;
  readonly nativeValueDelta: UniswapV4ObservedDelta;
  readonly token0Delta: UniswapV4ObservedDelta;
  readonly token1Delta: UniswapV4ObservedDelta;
};

export type UniswapV4SimulationTransaction = {
  readonly data: `0x${string}`;
  readonly id: string;
  readonly kind: "erc20Approval" | "poolInitialization" | "positionManager";
  readonly requires?: string;
  readonly to: Address;
  readonly value: string;
};

export type UniswapV4SimulatedTransaction = SimulationResult & {
  readonly balanceChangesSource: "fallback" | "trace";
};

export type UniswapV4StageSimulationBackend = {
  readonly applyPriorStage?: (stage: UniswapV4SimulationTransaction) => Promise<boolean>;
  readonly simulate: (
    stage: UniswapV4SimulationTransaction
  ) => Promise<UniswapV4SimulatedTransaction>;
};

export type UniswapV4SimulationStageDiagnostic =
  | {
      readonly balanceChangesSource: "fallback" | "trace";
      readonly gasEstimate: string;
      readonly id: string;
      readonly status: "succeeded";
    }
  | { readonly id: string; readonly reason: string; readonly status: "reverted" }
  | {
      readonly blockedBy: string;
      readonly id: string;
      readonly status: "blocked_by_prerequisite";
    };

export type UniswapV4StageSimulationInput = {
  readonly actions: readonly UniswapV4SimulationTransaction[];
  readonly backend: UniswapV4StageSimulationBackend;
};

export type UniswapV4StageSimulationResult = {
  readonly stages: readonly UniswapV4SimulationStageDiagnostic[];
  readonly success: boolean;
};

export async function simulateUniswapV4Stages(
  input: UniswapV4StageSimulationInput
): Promise<UniswapV4StageSimulationResult> {
  const stages: UniswapV4SimulationStageDiagnostic[] = [];
  let blockedBy: string | undefined;

  for (const action of input.actions) {
    if (blockedBy !== undefined) {
      stages.push({ blockedBy, id: action.id, status: "blocked_by_prerequisite" });
      continue;
    }
    if (action.requires !== undefined) {
      stages.push({ blockedBy: action.requires, id: action.id, status: "blocked_by_prerequisite" });
      blockedBy = action.requires;
      continue;
    }

    try {
      const result = await input.backend.simulate(action);
      stages.push({
        balanceChangesSource: result.balanceChangesSource,
        gasEstimate: result.gasEstimate,
        id: action.id,
        status: "succeeded",
      });
      if (action.kind !== "positionManager") {
        const applied = await input.backend.applyPriorStage?.(action);
        if (applied !== true) blockedBy = action.id;
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "Uniswap v4 simulation failed";
      stages.push({ id: action.id, reason, status: "reverted" });
      blockedBy = action.id;
    }
  }

  return {
    stages,
    success: stages.length > 0 && stages.every((stage) => stage.status === "succeeded"),
  };
}

export function compareUniswapV4ExpectedDeltas(input: {
  readonly actual: UniswapV4ObservedDeltas;
  readonly expected: UniswapV4ExpectedDeltas;
}): {
  readonly matchesExpected: boolean | null;
  readonly mismatches: readonly string[];
  readonly status: "matched" | "mismatched" | "unavailable";
  readonly unavailable: readonly string[];
} {
  const components = ["token0Delta", "token1Delta", "liquidityDelta", "nativeValueDelta"] as const;
  const mismatches: string[] = [];
  const unavailable: string[] = [];

  for (const component of components) {
    const observed = input.actual[component];
    if (observed.status === "unavailable") {
      unavailable.push(component);
      continue;
    }
    const expected = input.expected[component];
    const minimum = input.expected[minimumKey(component)] ?? expected;
    const maximum = input.expected[maximumKey(component)] ?? expected;
    const actualValue = BigInt(observed.value);
    if (actualValue < BigInt(minimum) || actualValue > BigInt(maximum)) {
      mismatches.push(
        `${component} ${observed.value} is outside expected range [${minimum}, ${maximum}]`
      );
    }
  }

  if (mismatches.length > 0) {
    return { matchesExpected: false, mismatches, status: "mismatched", unavailable };
  }
  if (unavailable.length > 0) {
    return { matchesExpected: null, mismatches, status: "unavailable", unavailable };
  }
  return { matchesExpected: true, mismatches, status: "matched", unavailable };
}

function minimumKey(
  component: "token0Delta" | "token1Delta" | "liquidityDelta" | "nativeValueDelta"
): "token0Min" | "token1Min" | "liquidityDelta" | "nativeValueDelta" {
  switch (component) {
    case "token0Delta":
      return "token0Min";
    case "token1Delta":
      return "token1Min";
    case "liquidityDelta":
      return "liquidityDelta";
    case "nativeValueDelta":
      return "nativeValueDelta";
  }
}

function maximumKey(
  component: "token0Delta" | "token1Delta" | "liquidityDelta" | "nativeValueDelta"
): "token0Max" | "token1Max" | "liquidityDelta" | "nativeValueDelta" {
  switch (component) {
    case "token0Delta":
      return "token0Max";
    case "token1Delta":
      return "token1Max";
    case "liquidityDelta":
      return "liquidityDelta";
    case "nativeValueDelta":
      return "nativeValueDelta";
  }
}
