import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn(() => ({ chainId: 8453 })),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn(() => ({ mode: "active" })),
}));

import { getConfig } from "../../src/config/env.js";
import {
  requireActiveWallet,
  resolveChainId,
  withToolErrorHandler,
} from "../../src/utils/tool-helpers.js";
import { getWalletState } from "../../src/wallet/persistence.js";

describe("resolveChainId", () => {
  it("returns params.chainId when it is a number", () => {
    expect(resolveChainId({ chainId: 137 })).toBe(137);
  });

  it("falls back to config chainId when params.chainId is not a number", () => {
    vi.mocked(getConfig).mockReturnValue({ chainId: 42161 } as ReturnType<typeof getConfig>);
    expect(resolveChainId({ chainId: "not-a-number" })).toBe(42161);
    expect(resolveChainId({})).toBe(42161);
  });
});

describe("requireActiveWallet", () => {
  it("returns null when wallet is active", () => {
    vi.mocked(getWalletState).mockReturnValue({ mode: "active" } as ReturnType<
      typeof getWalletState
    >);
    expect(requireActiveWallet("send_transaction")).toBeNull();
  });

  it("returns error CallToolResult when wallet is read-only", () => {
    vi.mocked(getWalletState).mockReturnValue({ mode: "read-only" } as ReturnType<
      typeof getWalletState
    >);
    const result = requireActiveWallet("send_transaction");
    expect(result).not.toBeNull();
    expect(result?.isError).toBe(true);
    const text = (result?.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toBe("WALLET_READ_ONLY");
    expect(parsed.message).toContain("send_transaction");
  });
});

describe("withToolErrorHandler", () => {
  it("returns the result of fn() on success", async () => {
    const expected = {
      content: [{ type: "text" as const, text: "ok" }],
      isError: false,
    };
    const result = await withToolErrorHandler("TEST", async () => expected);
    expect(result).toEqual(expected);
  });

  it("catches errors and returns formatted error", async () => {
    const result = await withToolErrorHandler("BOOM", async () => {
      throw new Error("something broke");
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toBe("BOOM");
    expect(parsed.message).toBe("something broke");
  });
});
