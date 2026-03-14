import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyServer } from "../../src/runtime/server.js";

const mockState = vi.hoisted(() => {
  const serverInstances: Array<{
    // biome-ignore lint/suspicious/noExplicitAny: mock handler type requires flexible request typing
    handlers: Map<unknown, (request: any) => Promise<any>>;
    connect: ReturnType<typeof vi.fn>;
    notification: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  const schemas = {
    list: { type: "list" },
    call: { type: "call" },
  };

  const dispatchGoatTool = vi.fn();
  const lifiHandler = vi.fn();
  const orbsHandler = vi.fn();
  const walletHandler = vi.fn();
  const transactionHandler = vi.fn();
  const utilityHandler = vi.fn();
  const walletListeners: Array<(state: unknown) => void> = [];
  const walletEvents = {
    on: vi.fn((_event: string, listener: (state: unknown) => void) => {
      walletListeners.push(listener);
    }),
    off: vi.fn((_event: string, listener: (state: unknown) => void) => {
      const index = walletListeners.indexOf(listener);
      if (index >= 0) {
        walletListeners.splice(index, 1);
      }
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
    transactionHandler,
    utilityHandler,
    walletListeners,
    walletEvents,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class {
    // biome-ignore lint/suspicious/noExplicitAny: mock handler type requires flexible request typing
    private readonly handlers = new Map<unknown, (request: any) => Promise<any>>();
    private readonly connectSpy = vi.fn().mockResolvedValue(undefined);
    private readonly notificationSpy = vi.fn();
    private readonly closeSpy = vi.fn().mockResolvedValue(undefined);

    constructor() {
      mockState.serverInstances.push({
        handlers: this.handlers,
        connect: this.connectSpy,
        notification: this.notificationSpy,
        close: this.closeSpy,
      });
    }

    // biome-ignore lint/suspicious/noExplicitAny: mock handler type requires flexible request typing
    setRequestHandler(schema: unknown, handler: (request: any) => Promise<any>): void {
      this.handlers.set(schema, handler);
    }

    async connect(transport: unknown): Promise<void> {
      await this.connectSpy(transport);
    }

    notification(payload: unknown): Promise<void> {
      this.notificationSpy(payload);
      return Promise.resolve();
    }

    async close(): Promise<void> {
      await this.closeSpy();
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

vi.mock("../../src/chains/registry.js", () => ({}));

vi.mock("../../src/goat/dispatch.js", () => ({
  dispatchGoatTool: mockState.dispatchGoatTool,
  RESTRICTED_PLUGIN_CHAINS: {
    uniswap: [1, 137, 43114, 8453, 10, 42161, 42220],
    balancer: [34443, 8453, 137, 100, 42161, 43114, 10],
  },
}));

vi.mock("../../src/tools/register.js", () => ({
  getWalletToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "wallet_generate",
      category: "wallet",
      description: "wallet",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.walletHandler,
    },
  ]),
  getTransactionToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "transaction_confirm",
      category: "transaction",
      description: "transaction",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.transactionHandler,
    },
    {
      name: "transaction_simulate",
      category: "transaction",
      description: "transaction_simulate",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.transactionHandler,
    },
  ]),
  getUtilityToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "server_status",
      category: "status",
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
      category: "swap",
      description: "lifi",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.lifiHandler,
    },
    {
      name: "lifi_prepare_bridge_intent",
      category: "swap",
      description: "lifi_prepare_bridge_intent",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.lifiHandler,
    },
  ]),
}));

vi.mock("../../src/tools/orbs/index.js", () => ({
  getOrbsToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "orbs_get_quote",
      category: "swap",
      description: "orbs",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.orbsHandler,
    },
    {
      name: "orbs_prepare_swap_intent",
      category: "swap",
      description: "orbs_prepare_swap_intent",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.orbsHandler,
    },
    {
      name: "orbs_submit_signed_swap",
      category: "swap",
      description: "orbs_submit_signed_swap",
      inputSchema: { type: "object", properties: {} },
      handler: mockState.orbsHandler,
    },
  ]),
}));

vi.mock("../../src/tools/tokens/index.js", () => ({
  getTokenToolDefinitions: vi.fn().mockReturnValue([
    {
      name: "resolve_token",
      category: "tokens",
      description: "resolve_token",
      inputSchema: { type: "object", properties: {} },
      handler: vi.fn(),
    },
    {
      name: "list_chain_tokens",
      category: "tokens",
      description: "list_chain_tokens",
      inputSchema: { type: "object", properties: {} },
      handler: vi.fn(),
    },
  ]),
}));

vi.mock("../../src/tools/x402/index.js", () => ({
  getX402ToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/acp/index.js", () => ({
  getErc8183ToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/agdp/index.js", () => ({
  getAgdpToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/tools/acp-virtuals/index.js", () => ({
  getAcpToolDefinitions: vi.fn().mockReturnValue(
    [
      "acp_create_job",
      "acp_set_budget",
      "acp_fund_job",
      "acp_submit_job",
      "acp_complete_job",
      "acp_reject_job",
      "acp_claim_refund",
      "acp_get_job",
    ].map((name) => ({
      name,
      category: "agenticEconomy",
      description: name,
      inputSchema: { type: "object", properties: {} },
      handler: vi.fn(),
    }))
  ),
}));

vi.mock("../../src/tools/erc8004/index.js", () => ({
  getErc8004ToolDefinitions: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/wallet/events.js", () => ({
  walletEvents: mockState.walletEvents,
}));

describe("ProxyServer", () => {
  const blockscoutCallTool = vi.fn();
  const etherscanCallTool = vi.fn();
  const evmCallTool = vi.fn();
  const blockscoutShutdown = vi.fn().mockResolvedValue(undefined);
  const etherscanShutdown = vi.fn().mockResolvedValue(undefined);
  const evmShutdown = vi.fn().mockResolvedValue(undefined);

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
    shutdown: blockscoutShutdown,
  };

  const etherscanAdapter = {
    getTools: vi.fn().mockReturnValue([
      {
        name: "etherscan_get_address_balance",
        description: "etherscan",
        inputSchema: { type: "object", properties: {} },
        upstreamName: "get_address_balance",
        prefix: "etherscan",
      },
    ]),
    callTool: etherscanCallTool,
    shutdown: etherscanShutdown,
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
    shutdown: evmShutdown,
  };

  const goatProvider = {
    getAllToolNames: vi.fn().mockReturnValue(["uniswap_swap"]),
    getReferenceSnapshot: vi.fn().mockReturnValue({
      chainId: 1,
      listOfTools: [
        {
          name: "uniswap_swap",
          description: "goat",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      toolHandler: vi.fn(),
    }),
    waitForRebuild: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
  };

  beforeEach(() => {
    mockState.serverInstances.length = 0;
    mockState.walletListeners.length = 0;
    blockscoutCallTool.mockReset();
    etherscanCallTool.mockReset();
    evmCallTool.mockReset();
    blockscoutShutdown.mockClear();
    etherscanShutdown.mockClear();
    evmShutdown.mockClear();
    mockState.dispatchGoatTool.mockReset();
    mockState.lifiHandler.mockReset();
    mockState.orbsHandler.mockReset();
    mockState.walletHandler.mockReset();
    mockState.transactionHandler.mockReset();
    mockState.utilityHandler.mockReset();
    mockState.walletEvents.on.mockClear();
    mockState.walletEvents.off.mockClear();
    mockState.walletEvents.emit.mockClear();
    goatProvider.waitForRebuild.mockReset().mockResolvedValue(undefined);
    goatProvider.shutdown.mockClear();
  });

  function setup() {
    new ProxyServer(
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      blockscoutAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      etherscanAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      evmAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      goatProvider as any
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
    const goatToolHasRestriction = result.tools.some(
      (tool: { name: string; description?: string }) =>
        tool.name === "uniswap_swap" &&
        typeof tool.description === "string" &&
        tool.description.includes("Only available on chains:")
    );

    expect(names).toEqual(
      expect.arrayContaining([
        "wallet_generate",
        "transaction_confirm",
        "transaction_simulate",
        "server_status",
        "uniswap_swap",
        "blockscout_get_address",
        "etherscan_get_address_balance",
        "evm_get_balance",
        "lifi_get_quote",
        "lifi_prepare_bridge_intent",
        "orbs_get_quote",
        "orbs_prepare_swap_intent",
        "orbs_submit_signed_swap",
        "resolve_token",
        "list_chain_tokens",
        "acp_create_job",
        "acp_set_budget",
        "acp_fund_job",
        "acp_submit_job",
        "acp_complete_job",
        "acp_reject_job",
        "acp_claim_refund",
        "acp_get_job",
      ])
    );
    expect(goatToolHasRestriction).toBe(true);
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

  it("routes etherscan tools to etherscan adapter", async () => {
    const { callHandler } = setup();
    etherscanCallTool.mockResolvedValue({ isError: false, content: [] });

    await callHandler({
      params: { name: "etherscan_get_address_balance", arguments: { address: "0x3" } },
    });

    expect(etherscanCallTool).toHaveBeenCalledWith("etherscan_get_address_balance", {
      address: "0x3",
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

    await callHandler({ params: { name: "uniswap_swap", arguments: { amount: 1 } } });

    expect(mockState.dispatchGoatTool).toHaveBeenCalledWith("uniswap_swap", {
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

  it("routes transaction tools to framework handlers", async () => {
    const { callHandler } = setup();
    mockState.transactionHandler.mockResolvedValue({ isError: false, content: [] });

    await callHandler({
      params: { name: "transaction_confirm", arguments: { id: "abc-123" } },
    });

    expect(mockState.transactionHandler).toHaveBeenCalledWith({ id: "abc-123" });
  });

  it("routes transaction_simulate through the framework transaction handler", async () => {
    const { callHandler } = setup();
    mockState.transactionHandler.mockResolvedValue({ isError: false, content: [] });

    await callHandler({
      params: {
        name: "transaction_simulate",
        arguments: {
          chainId: 8453,
          from: "0x1",
          to: "0x2",
          data: "0xdeadbeef",
        },
      },
    });

    expect(mockState.transactionHandler).toHaveBeenCalledWith({
      chainId: 8453,
      from: "0x1",
      to: "0x2",
      data: "0xdeadbeef",
    });
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

  it("emits tools/list_changed notification on wallet change", async () => {
    const { instance } = setup();

    mockState.walletEvents.emit("wallet-changed", {
      mode: "read-only",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    // waitForRebuild is a resolved promise, but the .then() chain needs a microtask tick
    await vi.waitFor(() => {
      expect(instance.notification).toHaveBeenCalledWith({
        method: "notifications/tools/list_changed",
      });
    });
  });

  it("waits for GOAT rebuild before tearing down legacy adapters", async () => {
    let resolveRebuild: (() => void) | undefined;
    goatProvider.waitForRebuild.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRebuild = resolve;
        })
    );

    const server = new ProxyServer(
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      blockscoutAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      etherscanAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      evmAdapter as any,
      // biome-ignore lint/suspicious/noExplicitAny: mock adapters don't implement full interface
      goatProvider as any
    );

    const shutdownPromise = server.shutdown();

    expect(goatProvider.shutdown).toHaveBeenCalledTimes(1);
    expect(goatProvider.waitForRebuild).toHaveBeenCalledTimes(1);
    expect(blockscoutShutdown).not.toHaveBeenCalled();
    expect(etherscanShutdown).not.toHaveBeenCalled();
    expect(evmShutdown).not.toHaveBeenCalled();

    if (!resolveRebuild) {
      throw new Error("Missing rebuild resolver");
    }
    resolveRebuild();
    await shutdownPromise;

    expect(blockscoutShutdown).toHaveBeenCalledTimes(1);
    expect(etherscanShutdown).toHaveBeenCalledTimes(1);
    expect(evmShutdown).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete legacy constructor arguments", () => {
    expect(
      () =>
        new ProxyServer(
          // biome-ignore lint/suspicious/noExplicitAny: incomplete legacy constructor path is under test
          blockscoutAdapter as any
        )
    ).toThrowError(/requires etherscanAdapter/);
  });
});
