import { describe, expect, it, vi } from "vitest";

vi.mock("@orbs-network/twap-sdk", () => ({
  Configs: {},
  getConfig: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@orbs-network/liquidity-hub-sdk", () => ({
  constructSDK: vi.fn().mockReturnValue({
    getQuote: vi.fn(),
    swap: vi.fn(),
  }),
  permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  maxUint256: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 8453 }),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({ mode: "read-only", chainId: 8453 }),
  getActiveAccount: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enabled: true,
    enqueue: vi.fn().mockReturnValue({ queued: true, id: "x", summary: "x" }),
  },
}));

describe("dSLTP feature gate", () => {
  it("DSLTP_AVAILABLE is false when SDK not validated", async () => {
    const { DSLTP_AVAILABLE } = await import("../../src/orbs/dsltp.js");
    expect(DSLTP_AVAILABLE).toBe(false);
  });

  it("getDsltpToolDefinitions returns empty array when not validated", async () => {
    const { getDsltpToolDefinitions } = await import("../../src/orbs/dsltp.js");
    expect(getDsltpToolDefinitions()).toHaveLength(0);
  });

  it("orbs tools do not include dSLTP tools when feature-gated", async () => {
    const { getOrbsToolDefinitions } = await import("../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    const dsltpTools = tools.filter(
      (t) => t.name.includes("stop_loss") || t.name.includes("take_profit")
    );
    expect(dsltpTools).toHaveLength(0);
  });

  it("total tool count is exactly 5 (no dSLTP)", async () => {
    const { getOrbsToolDefinitions } = await import("../../src/tools/orbs/index.js");
    const tools = getOrbsToolDefinitions();
    expect(tools).toHaveLength(5);
  });
});
