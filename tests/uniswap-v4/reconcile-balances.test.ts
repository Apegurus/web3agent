import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("../../src/evm/services.js", () => ({
  ERC20_BALANCE_ABI: [],
  getPublicClientCached: vi.fn(() => ({ readContract: mocks.readContract })),
}));

import { observeUniswapV4TokenBalances } from "../../src/uniswap-v4/reconcile-balances.js";
import { plan } from "../api/uniswap-v4-lifecycle-fixtures.js";

const RECIPIENT = "0x9999999999999999999999999999999999999999";

describe("observeUniswapV4TokenBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readContract.mockResolvedValueOnce(10n).mockResolvedValueOnce(15n);
  });

  it("Given collect proceeds sent to another recipient When reconciling Then it observes that recipient", async () => {
    const persisted = plan("collect");
    const collectPlan = {
      ...persisted,
      operation: { ...persisted.operation, recipient: RECIPIENT },
    };

    await observeUniswapV4TokenBalances(collectPlan, "2");

    expect(mocks.readContract).toHaveBeenCalledTimes(4);
    for (const call of mocks.readContract.mock.calls) {
      expect(call[0]).toMatchObject({ args: [RECIPIENT] });
    }
  });
});
