import type { ZeroExAdapterDecision } from "../zerox/capability.js";

export type SameChainSwapProviderSelection =
  | {
      readonly provider: "0x";
      readonly adapterSource: "goat" | "native";
      readonly capabilityDecisionId: ZeroExAdapterDecision["id"];
      readonly capabilityReason: ZeroExAdapterDecision["reason"];
    }
  | { readonly provider: "orbs"; readonly adapterSource: "orbs" };

export function selectSameChainSwapProvider(params: {
  readonly chainId: number;
  readonly adapterDecision: ZeroExAdapterDecision;
}): SameChainSwapProviderSelection {
  if (params.chainId === 4663) {
    return {
      provider: "0x",
      adapterSource: params.adapterDecision.adapterSource,
      capabilityDecisionId: params.adapterDecision.id,
      capabilityReason: params.adapterDecision.reason,
    };
  }
  return { provider: "orbs", adapterSource: "orbs" };
}
