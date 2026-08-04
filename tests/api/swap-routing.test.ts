import { describe, expect, it } from "vitest";
import { selectSameChainSwapProvider } from "../../src/api/swap-routing.js";
import {
  ZEROEX_CAPABILITY_DECISION_ID,
  type ZeroExAdapterDecision,
} from "../../src/zerox/capability.js";

const goatDecision = {
  id: ZEROEX_CAPABILITY_DECISION_ID,
  adapterSource: "goat",
  reason: "goat-capability-verified",
} satisfies ZeroExAdapterDecision;

const nativeDecision = {
  id: ZEROEX_CAPABILITY_DECISION_ID,
  adapterSource: "native",
  reason: "goat-chain-4663-unavailable",
} satisfies ZeroExAdapterDecision;

describe("same-chain swap provider selection", () => {
  it("selects 0x only for Robinhood and carries the automated adapter decision", () => {
    // Given: a Robinhood request and a verified GOAT capability
    const input = {
      chainId: 4663,
      adapterDecision: goatDecision,
    };

    // When: a provider is selected
    const result = selectSameChainSwapProvider(input);

    // Then: 0x is primary with its gate result preserved
    expect(result).toEqual({
      provider: "0x",
      adapterSource: "goat",
      capabilityDecisionId: ZEROEX_CAPABILITY_DECISION_ID,
      capabilityReason: "goat-capability-verified",
    });
  });

  it("preserves Orbs for every non-Robinhood same-chain request", () => {
    // Given: an existing supported Orbs chain
    const input = {
      chainId: 8453,
      adapterDecision: nativeDecision,
    };

    // When: a provider is selected
    const result = selectSameChainSwapProvider(input);

    // Then: the legacy provider and call surface remain unchanged
    expect(result).toEqual({ provider: "orbs", adapterSource: "orbs" });
  });
});
