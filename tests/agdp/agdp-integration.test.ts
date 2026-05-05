import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.AGDP_INTEGRATION)("aGDP live API integration", () => {
  it("searchOfferings returns valid agent array from live API", async () => {
    const { searchOfferings } = await import("../../src/agdp/api.js");
    const agents = await searchOfferings({ query: "defi", topK: 3 });
    expect(Array.isArray(agents)).toBe(true);
    if (agents.length > 0) {
      const agent = agents[0];
      expect(typeof agent.name).toBe("string");
      expect(typeof agent.walletAddress).toBe("string");
      expect("attributes" in agent).toBe(false);
    }
  }, 15000);
});
