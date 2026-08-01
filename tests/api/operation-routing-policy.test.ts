import { describe, expect, it } from "vitest";
import { prepareOperationSchema } from "../../src/api/schemas/operations.js";

describe("prepared Robinhood swap routing policy", () => {
  it("rejects direct LI.FI same-chain preparation", () => {
    // Given: a caller tries to bypass the 0x-first Robinhood route
    const input = {
      account: "0x1234567890123456789012345678901234567890",
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken: "0x3333333333333333333333333333333333333333",
      integration: "lifi",
      kind: "swap",
      toChainId: 4663,
      toToken: "0x4444444444444444444444444444444444444444",
    };

    // When: the public operation boundary parses the request
    const result = prepareOperationSchema.safeParse(input);

    // Then: LI.FI remains internal to an eligible 0x fallback
    expect(result.success).toBe(false);
  });
});
