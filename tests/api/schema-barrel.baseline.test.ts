import { describe, expect, it } from "vitest";

import {
  addressSchema,
  prepareOperationSchema,
  resumeOperationSchema,
} from "../../src/api/schemas.js";

describe("schema barrel baseline", () => {
  it("Given the existing operation schemas When imported from the public barrel Then shared schemas remain available", () => {
    expect(addressSchema.safeParse("0x0000000000000000000000000000000000000001").success).toBe(
      true
    );
    expect(prepareOperationSchema).toBeDefined();
    expect(resumeOperationSchema).toBeDefined();
  });
});
