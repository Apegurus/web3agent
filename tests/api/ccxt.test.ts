import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRuntime, mockInvokeAndRequireData } = vi.hoisted(() => ({
  mockGetRuntime: vi.fn(),
  mockInvokeAndRequireData: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mockGetRuntime,
  invokeAndRequireData: mockInvokeAndRequireData,
  createSDKInvoker(toolName: string) {
    return async (params: unknown, options?: unknown) => {
      const runtime = await mockGetRuntime(options);
      return mockInvokeAndRequireData(runtime, toolName, params);
    };
  },
}));

import {
  ccxtPrivateRead,
  ccxtPrivateWrite,
  ccxtPublicCall,
  describeCcxtExchange,
  listCcxtAccounts,
  listCcxtExchanges,
} from "../../src/api/ccxt.js";
import { getRuntime, invokeAndRequireData } from "../../src/api/shared.js";

describe("ccxt SDK functions", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock runtime has no typed interface
  const mockRuntime = {} as any;

  beforeEach(() => {
    vi.mocked(getRuntime).mockResolvedValue(mockRuntime);
    vi.mocked(invokeAndRequireData).mockResolvedValue({ data: "test" });
  });

  it("listCcxtExchanges invokes the correct tool", async () => {
    await listCcxtExchanges({});
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_list_exchanges", {});
  });

  it("describeCcxtExchange invokes the correct tool", async () => {
    await describeCcxtExchange({ exchange: "kraken" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_describe_exchange", {
      exchange: "kraken",
    });
  });

  it("listCcxtAccounts invokes the correct tool", async () => {
    await listCcxtAccounts({});
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_list_accounts", {});
  });

  it("ccxtPublicCall invokes the correct tool", async () => {
    await ccxtPublicCall({
      exchange: "kraken",
      method: "fetchTicker",
      args: ["BTC/USD"],
    });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_public_call", {
      exchange: "kraken",
      method: "fetchTicker",
      args: ["BTC/USD"],
    });
  });

  it("ccxtPrivateRead invokes the correct tool", async () => {
    await ccxtPrivateRead({
      account: "kraken_main",
      method: "fetchBalance",
    });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_private_read", {
      account: "kraken_main",
      method: "fetchBalance",
    });
  });

  it("ccxtPrivateWrite invokes the correct tool", async () => {
    await ccxtPrivateWrite({
      account: "kraken_main",
      method: "createOrder",
      args: ["BTC/USD", "limit", "buy", 1],
    });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "ccxt_private_write", {
      account: "kraken_main",
      method: "createOrder",
      args: ["BTC/USD", "limit", "buy", 1],
    });
  });

  it("re-exports CCXT SDK helpers from the package root", async () => {
    const api = await import("../../src/index.js");
    expect(api.ccxtPublicCall).toBeTypeOf("function");
    expect(api.listCcxtExchanges).toBeTypeOf("function");
  });
});
