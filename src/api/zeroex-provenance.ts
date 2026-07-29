import { Web3AgentError } from "./errors.js";
import type { SameChainSwapProviderSelection } from "./swap-routing.js";

type ZeroExAdapterSource = "goat" | "native";

export type ZeroExAdapterProvenance = {
  readonly adapterSource: ZeroExAdapterSource;
  readonly capabilityDecisionId: string;
  readonly capabilityReason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidProvenance(message: string): never {
  throw new Web3AgentError({
    code: "ZEROEX_ADAPTER_PROVENANCE_MISMATCH",
    message,
  });
}

export function requireZeroExAdapterProvenance(
  value: unknown,
  selection: Extract<SameChainSwapProviderSelection, { provider: "0x" }>
): ZeroExAdapterProvenance {
  if (!isRecord(value)) invalidProvenance("0x adapter returned no provenance record");
  const { adapterSource, capabilityDecisionId, capabilityReason } = value;
  if (adapterSource !== "goat" && adapterSource !== "native") {
    invalidProvenance("0x adapter returned a missing or invalid adapter source");
  }
  if (typeof capabilityDecisionId !== "string" || typeof capabilityReason !== "string") {
    invalidProvenance("0x adapter returned incomplete capability provenance");
  }
  if (
    adapterSource !== selection.adapterSource ||
    capabilityDecisionId !== selection.capabilityDecisionId ||
    capabilityReason !== selection.capabilityReason
  ) {
    invalidProvenance("0x adapter provenance does not match the selected capability decision");
  }
  return { adapterSource, capabilityDecisionId, capabilityReason };
}

export function requireZeroExExecutionProvenance(
  value: unknown,
  selection: Extract<SameChainSwapProviderSelection, { provider: "0x" }>
): void {
  if (!isRecord(value)) invalidProvenance("0x execution returned no provenance record");
  if (value.provider === "lifi") {
    if (
      value.adapterSource === "lifi" &&
      (value.fallbackReason === "no-route" || value.fallbackReason === "provider-unavailable")
    ) {
      return;
    }
    invalidProvenance("LI.FI fallback execution returned incomplete provenance");
  }
  if (value.provider !== "0x") invalidProvenance("0x execution returned an invalid provider");
  requireZeroExAdapterProvenance(value, selection);
}
