import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyServer } from "../../src/runtime/server.js";

const mockState = vi.hoisted(() => {
  const serverInstances: Array<{
    handlers: Map<unknown, (request: any) => Promise<any>>;
    connect: ReturnType<typeof vi.fn>;
    notification: ReturnType<typeof vi.fn>;
  }> = [];

  const schemas = {
    list: { type: "list" },
    call: { type: "call" },
  };

  const dispatchGoatTool = vi.fn();
  const lifiHandler = vi.fn();
  const orbsHandler = vi.fn();
  const walletHandler = vi.fn();
  const utilityHandler = vi.fn();
  const walletListeners: Array<(state: unknown) => void> = [];
  const walletEvents = {
    on: vi.fn((_event: string, listener: (state: unknown) => void) => {
      walletListeners.push(listener);
    }),
    emit: vi.fn((_event: string, state: unknown) => {
      for (const listener of walletListeners) {
        listener(state);
      }
      return true;
    }),
  };

  return {
    serverInstances,
    schemas,
    dispatchGoatTool,
    lifiHandler,
    orbsHandler,
    walletHandler,
    utilityHandler,
    walletEvents,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class {
    private readonly handlers = new Map<unknown, (request: any) => Promise<any>>();
    private readonly connectSpy = vi.fn().mockResolvedValue(undefined);
    private readonly notificationSpy = vi.fn();

    constructor() {
      mockState.serverInstances.push({
        handlers: this.handlers,
        connect: this.connectSpy,
        notification: this.notificationSpy,
      });
    }

    setRequestHandler(schema: unknown, handler: (request: any) => Promise<any>): void {
      this.handlers.set(schema, handler);
    }

    async connect(transport: unknown): Promise<void> {
      await this.connectSpy(transport);
    }

    notification(payload: unknown): void {
      this.notificationSpy(payload);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: mockState.schemas.list,
  CallToolRequestSchema: mockState.schemas.call,
}));

vi.mock("../../src/chains/registry.js", () => ({
  getAllChains: vi.fn().mockReturnValue([{ id: 1 }, { id: 8453 }]),
}));

vi.mock("../../src/goat/dispatch.js", () => ({
  dispatchGoatTool: mockState.dispatchGoatTool,
}));

vi.mock("../../src/tools/register.js", () => ({
  getWalletToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "wallet_generate",
      description: "wallet",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.walletHandler,
    },
  ]),
  getUtilityToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "server_status",
      description: "utility",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.utilityHandler,
    },
  ]),
}));

vi.mock("../../src/tools/lifi/index.js", () => ({
  getLifiToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "lifi_get_quote",
      description: "lifi",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.lifiHandler,
    },
  ]),
}));

vi.mock("../../src/tools/orbs/index.js", () => ({
  getOrbsToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "orbs_get_quote",
      description: "orbs",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.orbsHandler,
    },
  ]),
}));

vi.mock("../../src/wallet/events.js", () => ({
  walletEvents: mockState.walletEvents,
}));

describe("ProxyServer", () => {
  const blockscoutCallTool = vi.fn();
  const evmCallTool = vi.fn();

  const blockscoutAdapter = {
    getTools: vi.fn().mockReturnValue([
      {
        name: "blockscout_get_address",
        description: "blockscout",
        inputSchema: { type: "object", properties: {} },
        upstreamName: "get_address",
        prefix: "blockscout",
      },
    ]),
    callTool: blockscoutCallTool,
  };

  const evmAdapter = {
    getTools: vi.fn().mockReturnValue([
      {
        name: "evm_get_balance",
        description: "evm",
        inputSchema: { type: "object", properties: {} },
        upstreamName: "get_balance",
        prefix: "evm",
      },
    ]),
    callTool: evmCallTool,
  };

  const goatProvider = {
    getAllToolNames: vi.fn().mockReturnValue(["goat_swap"]),
    getSnapshot: vi.fn().mockImplementation((chainId: number) =>
      chainId === 1
        ? {
            chainId,
            listOfTools: [
              {
                name: "goat_swap",
                description: "goat",
                inputSchema: { type: "object", properties: {} },
              },
            ],
            toolHandler: vi.fn(),
          }
        : undefined,
    ),
  };

  beforeEach(() => {
    mockState.serverInstances.length = 0;
    blockscoutCallTool.mockReset();
    evmCallTool.mockReset();
    mockState.dispatchGoatTool.mockReset();
    mockState.lifiHandler.mockReset();
    mockState.orbsHandler.mockReset();
    mockState.walletHandler.mockReset();
    mockState.utilityHandler.mockReset();
  });

  function setup() {
    new ProxyServer(
      blockscoutAdapter as any,
      evmAdapter as any,
      goatProvider as any,
    );
    const instance = mockState.serverInstances.at(-1);
    if (!instance) throw new Error("Missing server instance");
    const listHandler = instance.handlers.get(mockState.schemas.list);
    const callHandler = instance.handlers.get(mockState.schemas.call);
    if (!listHandler || !callHandler) {
      throw new Error("Missing handlers");
    }
    return { instance, listHandler, callHandler };
  }

  it("aggregates tools from framework, goat, upstream, and partner adapters", async () => {
    const { listHandler } = setup();
    const result = await listHandler({});
    const names = result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toEqual([
      "wallet_generate",
      "server_status",
      "goat_swap",
      "blockscout_get_address",
      "evm_get_balance",
      "lifi_get_quote",
      "orbs_get_quote",
    ]);
  });

  it("routes blockscout tools to blockscout adapter", async () => {
    const { callHandler } = setup();
    blockscoutCallTool.mockResolvedValue({ isError: false, content: [] });

    await callHandler({
      params: { name: "blockscout_get_address", arguments: { address: "0x1" } },
    });

    expect(blockscoutCallTool).toHaveBeenCalledWith("blockscout_get_address", {
      address: "0x1",
    });
  });

  it("routes evm tools to evm adapter", async () => {
    const { callHandler } = setup();
    evmCallTool.mockResolvedValue({ isError: false, content: [] });

    await callHandler({
      params: { name: "evm_get_balance", arguments: { address: "0x2" } },
    });

    expect(evmCallTool).toHaveBeenCalledWith("evm_get_balance", {
      address: "0x2",
    });
  });

  it("routes GOAT tools through dispatchGoatTool", async () => {
    const { callHandler } = setup();
    mockState.dispatchGoatTool.mockResolvedValue({ isError: false, content: [] });

    await callHandler({ params: { name: "goat_swap", arguments: { amount: 1 } } });

    expect(mockState.dispatchGoatTool).toHaveBeenCalledWith("goat_swap", {
      amount: 1,
    });
  });

  it("routes lifi tools to lifi handlers", async () => {
    const { callHandler } = setup();
    mockState.lifiHandler.mockResolvedValue({ isError: false, content: [] });

    await callHandler({ params: { name: "lifi_get_quote", arguments: {} } });

    expect(mockState.lifiHandler).toHaveBeenCalled();
  });

  it("routes orbs tools to orbs handlers", async () => {
    const { callHandler } = setup();
    mockState.orbsHandler.mockResolvedValue({ isError: false, content: [] });

    await callHandler({ params: { name: "orbs_get_quote", arguments: {} } });

    expect(mockState.orbsHandler).toHaveBeenCalled();
  });

  it("returns UNKNOWN_TOOL for unknown calls", async () => {
    const { callHandler } = setup();

    const result = await callHandler({
      params: { name: "totally_unknown", arguments: {} },
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("UNKNOWN_TOOL");
  });

  it("emits tools/list_changed notification on wallet change", () => {
    const { instance } = setup();

    mockState.walletEvents.emit("wallet-changed", {
      mode: "read-only",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    expect(instance.notification).toHaveBeenCalledWith({
      method: "notifications/tools/list_changed",
    });
  });
});
