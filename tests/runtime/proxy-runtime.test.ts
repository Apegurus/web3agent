import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyServer } from "../../src/runtime/server.js";

type MockRequest = {
  params?: {
    name: string;
    arguments?: Record<string, unknown>;
  };
};

type MockHandler = (request: MockRequest) => Promise<unknown>;

const mockState = vi.hoisted(() => {
  const serverInstances: Array<{
    handlers: Map<unknown, MockHandler>;
    notification: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  const schemas = {
    list: { type: "list" },
    call: { type: "call" },
  };

  return {
    serverInstances,
    schemas,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class {
    private readonly handlers = new Map<unknown, MockHandler>();
    private readonly notificationSpy = vi.fn().mockResolvedValue(undefined);
    private readonly closeSpy = vi.fn().mockResolvedValue(undefined);

    constructor() {
      mockState.serverInstances.push({
        handlers: this.handlers,
        notification: this.notificationSpy,
        close: this.closeSpy,
      });
    }

    setRequestHandler(schema: unknown, handler: MockHandler): void {
      this.handlers.set(schema, handler);
    }

    notification(payload: unknown): Promise<void> {
      return this.notificationSpy(payload);
    }

    async close(): Promise<void> {
      await this.closeSpy();
    }

    async connect(): Promise<void> {
      return undefined;
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

describe("ProxyServer", () => {
  let toolsChangedListener: (() => void) | undefined;

  const runtimeMock = {
    getMcpTools: vi.fn(),
    invokeTool: vi.fn(),
    onToolsChanged: vi.fn(),
    shutdown: vi.fn(),
  };

  beforeEach(() => {
    mockState.serverInstances.length = 0;
    runtimeMock.getMcpTools.mockReset().mockReturnValue([
      {
        name: "wallet_generate",
        description: "wallet",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    runtimeMock.invokeTool.mockReset().mockResolvedValue({ isError: false, content: [] });
    runtimeMock.shutdown.mockReset().mockResolvedValue(undefined);
    runtimeMock.onToolsChanged.mockReset().mockImplementation((listener: () => void) => {
      toolsChangedListener = listener;
      return vi.fn();
    });
    toolsChangedListener = undefined;
  });

  it("lists tools through ManagedRuntime bridge", async () => {
    const runtime = runtimeMock as unknown as ConstructorParameters<typeof ProxyServer>[0];
    new ProxyServer(runtime);
    const instance = mockState.serverInstances.at(-1);
    if (!instance) throw new Error("Missing server instance");
    const listHandler = instance.handlers.get(mockState.schemas.list);
    if (!listHandler) throw new Error("Missing list handler");

    const result = (await listHandler({})) as { tools: unknown[] };

    expect(result.tools).toEqual(runtimeMock.getMcpTools.mock.results[0]?.value);
  });

  it("invokes tools through ManagedRuntime bridge", async () => {
    const runtime = runtimeMock as unknown as ConstructorParameters<typeof ProxyServer>[0];
    new ProxyServer(runtime);
    const instance = mockState.serverInstances.at(-1);
    if (!instance) throw new Error("Missing server instance");
    const callHandler = instance.handlers.get(mockState.schemas.call);
    if (!callHandler) throw new Error("Missing call handler");

    await callHandler({ params: { name: "wallet_generate", arguments: { entropy: 1 } } });

    expect(runtimeMock.invokeTool).toHaveBeenCalledWith("wallet_generate", { entropy: 1 });
  });

  it("forwards tools/list_changed notifications", async () => {
    const runtime = runtimeMock as unknown as ConstructorParameters<typeof ProxyServer>[0];
    new ProxyServer(runtime);
    const instance = mockState.serverInstances.at(-1);
    if (!instance) throw new Error("Missing server instance");

    toolsChangedListener?.();

    await vi.waitFor(() => {
      expect(instance.notification).toHaveBeenCalledWith({
        method: "notifications/tools/list_changed",
      });
    });
  });
});
