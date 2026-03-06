import { describe, expect, it, vi } from "vitest";
import type { WalletState } from "../../src/types/wallet.js";
import { walletEvents } from "../../src/wallet/events.js";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "get_balance",
          description: "",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({ content: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    process: { pid: 99, kill: vi.fn() },
  })),
}));

describe("EvmAdapter — wallet refresh", () => {
  it("restart increments restartCount after wallet-changed", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();

    const initialCount = adapter.getHealth().restartCount ?? 0;

    walletEvents.emit("wallet-changed", {
      mode: "private-key",
      address: "0x1",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    } as WalletState);

    await new Promise((r) => setTimeout(r, 50));

    const health = adapter.getHealth();
    expect(health.restartCount ?? 0).toBeGreaterThan(initialCount);
  });

  it("health reports lastRestartAt after wallet-changed", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();

    walletEvents.emit("wallet-changed", {
      mode: "mnemonic",
      address: "0x2",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    } as WalletState);

    await new Promise((r) => setTimeout(r, 50));

    const health = adapter.getHealth();
    expect(health.lastRestartAt).toBeInstanceOf(Date);
  });

  it("adapter remains ok after restart", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();

    walletEvents.emit("wallet-changed", {
      mode: "private-key",
      address: "0x3",
      chainId: 137,
      accountIndex: 1,
      addressIndex: 0,
    } as WalletState);

    await new Promise((r) => setTimeout(r, 50));

    expect(adapter.getHealth().status).toBe("ok");
    expect(adapter.getTools().length).toBeGreaterThan(0);
  });
});
