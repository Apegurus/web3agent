import { describe, expect, it } from "vitest";
import type { WalletState } from "../../src/types/wallet.js";
import type { WalletBackend } from "../../src/wallet/backend.js";

describe("WalletBackend interface", () => {
  it("mock implementation satisfies WalletBackend and info.type is legacy", () => {
    const mockState: WalletState = {
      mode: "private-key",
      address: "0x0000000000000000000000000000000000000001",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    };

    const mock: WalletBackend = {
      info: { type: "legacy", reason: "test mock" },
      initialize: async (_config) => {
        return;
      },
      getState: () => mockState,
      getAccount: () => {
        throw new Error("not implemented in mock");
      },
      activate: async (_params) => mockState,
      deactivate: async () => {
        return;
      },
      getKeyForSubprocess: async () => null,
    };

    expect(mock.info.type).toBe("legacy");
  });
});
