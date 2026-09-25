import * as liquidityHubSdk from "@orbs-network/liquidity-hub-sdk";
import { describe, expect, it } from "vitest";

// Orbs replaced `constructSDK` with `createClient` in the 1.1.0 minor release,
// which crashed fresh installs at import time. Guard the exports we depend on.
describe("@orbs-network/liquidity-hub-sdk contract", () => {
  it("exports createClient", () => {
    expect(typeof liquidityHubSdk.createClient).toBe("function");
  });

  it("creates clients with getQuote and swap", () => {
    const client = liquidityHubSdk.createClient({ chainId: 8453, partner: "widget" });
    expect(typeof client.getQuote).toBe("function");
    expect(typeof client.swap).toBe("function");
  });
});
