import { describe, expect, it } from "vitest";

import { executeUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-executor.js";
import { confirmationQueue } from "../../src/wallet/confirmation.js";
import { ACCOUNT, mintPlan } from "./uniswap-v4-write-tools-fixtures.js";

describe("Uniswap v4 write confirmation reservation", () => {
  it("Given a valid plan interrupted by a concurrent confirmation, when confirmed twice, then only one executor reservation is issued", () => {
    confirmationQueue.flushAll();
    const pending = confirmationQueue.enqueue(
      "uniswap_v4_mint_position",
      "Mint Uniswap v4 position",
      mintPlan(),
      executeUniswapV4WritePlan,
      ACCOUNT,
      "financial"
    );
    if (pending.id === null) throw new Error("Expected queue identifier");

    expect(confirmationQueue.confirm(pending.id)).not.toBeNull();
    expect(confirmationQueue.confirm(pending.id)).toBeNull();
  });
});
