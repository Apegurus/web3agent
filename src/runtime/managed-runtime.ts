import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { ValidationError, parseEnv, withConfig } from "../config/env.js";
import { createDefaultHealthStatus } from "../config/health.js";
import { dispatchGoatTool } from "../goat/dispatch.js";
import { GoatProvider } from "../goat/provider.js";
import { initializeLifi } from "../lifi/config.js";
import { getErc8183ToolDefinitions, registerErc8183Executors } from "../tools/acp/index.js";
import { getAgdpToolDefinitions, registerAgdpExecutors } from "../tools/agdp/index.js";
import { getErc8004ToolDefinitions, registerErc8004Executors } from "../tools/erc8004/index.js";
import { getLifiToolDefinitions, registerLifiExecutors } from "../tools/lifi/index.js";
import { getOrbsToolDefinitions, registerOrbsExecutors } from "../tools/orbs/index.js";
import {
  type ToolDefinition,
  getTransactionToolDefinitions,
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
} from "../tools/register.js";
import { getTokenToolDefinitions } from "../tools/tokens/index.js";
import { setHealthStatus } from "../tools/utility/index.js";
import { getX402ToolDefinitions, registerX402Executors } from "../tools/x402/index.js";
import type { RuntimeConfig } from "../types/config.js";
import type { HealthStatus } from "../types/health.js";
import { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import { EtherscanAdapter } from "../upstream/etherscan/adapter.js";
import { EvmAdapter } from "../upstream/evm/adapter.js";
import { formatToolError } from "../utils/errors.js";
import { getToolResultPayload, normalizeCallToolResult } from "../utils/tool-results.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { walletEvents } from "../wallet/events.js";
import { getWalletState, initializeWallet } from "../wallet/persistence.js";
import { createGoatToolMetadata, normalizeInputSchema } from "./tool-metadata.js";
import {
  type CreateRuntimeOptions,
  type RuntimeHealth,
  type RuntimeToolListener,
  type ToolCatalogEntry,
  type ToolCategory,
  type ToolSource,
  type TransactionConfirmResult,
  type TransactionDenyResult,
  type TransactionListResult,
  type WalletActiveResult,
  type WalletAddressDerivationResult,
  type WalletConfirmationResult,
  type WalletDeactivationResult,
  type WalletDerivedAddressEntry,
  type WalletGenerateMnemonicResult,
  type WalletGenerateResult,
  type Web3AgentRuntime,
  toHealthStatus,
} from "./types.js";

type RuntimeToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult | unknown>;

interface RuntimeToolRecord extends ToolCatalogEntry {
  handler: RuntimeToolHandler;
}

function toCatalogEntry(
  tool: {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown> | object;
    category: ToolCategory;
    annotations?: Tool["annotations"];
  },
  source: ToolSource,
  dynamic = false
): ToolCatalogEntry {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: normalizeInputSchema(tool.inputSchema),
    source,
    category: tool.category,
    dynamic,
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  };
}

async function bootstrapCoreState(config: RuntimeConfig): Promise<number> {
  confirmationQueue.enabled = config.confirmWrites;
  confirmationQueue.ttlMs = config.confirmTtlMinutes * 60 * 1000;

  await initializeWallet({
    chainId: config.chainId,
    accountIndex: config.walletAccountIndex,
    addressIndex: config.walletAddressIndex,
    privateKey: config.privateKey,
    mnemonic: config.mnemonic,
  });

  registerOrbsExecutors();
  registerLifiExecutors();
  registerX402Executors();
  registerErc8183Executors();
  registerAgdpExecutors();
  registerErc8004Executors();
  initializeLifi(config.lifiApiKey);
  return confirmationQueue.loadQueue();
}

function summarizeBackends(health: HealthStatus): RuntimeHealth["backends"] {
  return {
    blockscout: { ...health.blockscout },
    etherscan: { ...health.etherscan },
    evm: { ...health.evm },
    goat: { ...health.goat },
    lifi: { ...health.lifi },
    orbs: { ...health.orbs },
    agenticEconomy: { ...health.agenticEconomy },
  };
}

export class ManagedRuntime implements Web3AgentRuntime {
  readonly wallet;
  readonly transactions;
  readonly status;
  readonly pendingOpsRestored: number;

  private readonly frameworkTools: ToolDefinition[];
  private readonly lifiTools: ToolDefinition[];
  private readonly orbsTools: ToolDefinition[];
  private readonly tokenTools: ToolDefinition[];
  private readonly x402Tools: ToolDefinition[];
  private readonly erc8183Tools: ToolDefinition[];
  private readonly agdpTools: ToolDefinition[];
  private readonly erc8004Tools: ToolDefinition[];
  private readonly goatProvider: GoatProvider;
  private readonly listeners = new Set<RuntimeToolListener>();
  private readonly health: HealthStatus;
  private readonly toolRecords = new Map<string, RuntimeToolRecord>();
  private walletChangeHandler?: () => void;
  private closed = false;

  constructor(
    readonly config: RuntimeConfig,
    private readonly blockscoutAdapter: BlockscoutAdapter,
    private readonly etherscanAdapter: EtherscanAdapter,
    private readonly evmAdapter: EvmAdapter,
    goatProvider: GoatProvider,
    pendingOpsRestored: number
  ) {
    this.goatProvider = goatProvider;
    this.pendingOpsRestored = pendingOpsRestored;
    this.frameworkTools = [
      ...getWalletToolDefinitions(),
      ...getTransactionToolDefinitions(),
      ...getUtilityToolDefinitions(),
    ];
    this.lifiTools = getLifiToolDefinitions();
    this.orbsTools = getOrbsToolDefinitions();
    this.tokenTools = getTokenToolDefinitions();
    this.x402Tools = getX402ToolDefinitions();
    this.erc8183Tools = getErc8183ToolDefinitions();
    this.agdpTools = getAgdpToolDefinitions();
    this.erc8004Tools = getErc8004ToolDefinitions();
    this.health = createDefaultHealthStatus();

    this.wallet = {
      generate: async () => this.requireToolData<WalletGenerateResult>("wallet_generate"),
      generateMnemonic: async () =>
        this.requireToolData<WalletGenerateMnemonicResult>("wallet_generate_mnemonic"),
      fromMnemonic: async (params: Record<string, unknown>) =>
        this.requireToolData<WalletAddressDerivationResult>("wallet_from_mnemonic", params),
      deriveAddresses: async (params: Record<string, unknown>) =>
        this.requireToolData<WalletDerivedAddressEntry[]>("wallet_derive_addresses", params),
      getActive: async () => this.requireToolData<WalletActiveResult>("wallet_get_active"),
      activate: async (params: Record<string, unknown>) =>
        this.requireToolData<WalletActiveResult>("wallet_activate", params),
      deactivate: async () => this.requireToolData<WalletDeactivationResult>("wallet_deactivate"),
      setConfirmation: async (params: Record<string, unknown>) =>
        this.requireToolData<WalletConfirmationResult>("wallet_set_confirmation", params),
    };

    this.transactions = {
      list: async () => this.requireToolData<TransactionListResult>("transaction_list"),
      confirm: async (id: string) =>
        this.requireToolData<TransactionConfirmResult>("transaction_confirm", { id }),
      deny: async (id: string) =>
        this.requireToolData<TransactionDenyResult>("transaction_deny", { id }),
    };

    this.status = {
      server: async () => this.getHealth(),
      supportedChains: async () => this.requireToolData("list_supported_chains"),
    };
  }

  initialize(): void {
    this.rebuildToolRegistry();
    this.refreshHealthStatus();
    this.walletChangeHandler = () => {
      const flushed = confirmationQueue.flushAll();
      if (flushed > 0) {
        process.stderr.write(
          `[web3agent] Wallet changed — flushed ${flushed} pending operation(s) from confirmation queue\n`
        );
      }
      this.goatProvider
        .waitForRebuild()
        .then(() => {
          this.rebuildToolRegistry();
          this.refreshHealthStatus();
          this.emitToolsChanged();
        })
        .catch((e: unknown) => {
          process.stderr.write(`[web3agent] Failed to refresh runtime tools: ${e}\n`);
        });
    };
    walletEvents.on("wallet-changed", this.walletChangeHandler);
  }

  listTools(): ToolCatalogEntry[] {
    return [...this.toolRecords.values()].map(({ handler: _handler, ...tool }) => tool);
  }

  getTool(name: string): ToolCatalogEntry | undefined {
    const tool = this.toolRecords.get(name);
    if (!tool) return undefined;
    const { handler: _handler, ...rest } = tool;
    return rest;
  }

  getMcpTools(): Tool[] {
    return this.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
  }

  async invokeTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    const tool = this.toolRecords.get(name);
    if (!tool) {
      return formatToolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    }

    try {
      const result = await withConfig(this.config, () => tool.handler(args));
      return normalizeCallToolResult(result);
    } catch (e: unknown) {
      return formatToolError("TOOL_INVOCATION_FAILED", e instanceof Error ? e.message : String(e));
    }
  }

  getHealth(): RuntimeHealth {
    this.refreshHealthStatus();
    const wallet = getWalletState();
    return {
      activeChainId: this.config.chainId,
      walletMode: wallet.mode,
      walletAddress: wallet.address,
      confirmWrites: confirmationQueue.enabled,
      toolCount: this.toolRecords.size,
      backends: summarizeBackends(this.health),
    };
  }

  onToolsChanged(listener: RuntimeToolListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.walletChangeHandler) {
      walletEvents.off("wallet-changed", this.walletChangeHandler);
      this.walletChangeHandler = undefined;
    }
    this.goatProvider.shutdown();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort wait before adapter teardown
    await this.goatProvider.waitForRebuild().catch(() => {});
    await Promise.allSettled([
      this.blockscoutAdapter.shutdown(),
      this.etherscanAdapter.shutdown(),
      this.evmAdapter.shutdown(),
    ]);
  }

  private async requireToolData<T = unknown>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const result = await this.invokeTool(name, args);
    const payload = getToolResultPayload(result);
    if (!payload.ok) {
      throw new Error(payload.error.message ?? `Tool invocation failed: ${name}`);
    }
    return payload.data as T;
  }

  private emitToolsChanged(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private refreshHealthStatus(): void {
    this.health.blockscout = this.blockscoutAdapter.getHealth();
    this.health.etherscan = this.etherscanAdapter.getHealth();
    this.health.evm = this.evmAdapter.getHealth();
    this.health.goat = {
      name: "goat",
      status: "ok",
      toolCount: this.goatProvider.getAllToolNames().length,
      message: `Loaded ${this.goatProvider.getAllToolNames().length} tools`,
    };
    this.health.lifi = {
      name: "lifi",
      status: "ok",
      toolCount: this.lifiTools.length,
      message: `Loaded ${this.lifiTools.length} tools`,
    };
    this.health.orbs = {
      name: "orbs",
      status: "ok",
      toolCount: this.orbsTools.length,
      message: `Loaded ${this.orbsTools.length} tools`,
    };
    const agenticEconomyToolCount =
      this.x402Tools.length +
      this.erc8183Tools.length +
      this.agdpTools.length +
      this.erc8004Tools.length;
    this.health.agenticEconomy = {
      name: "agentic-economy",
      status: "ok",
      toolCount: agenticEconomyToolCount,
      message: `Loaded ${agenticEconomyToolCount} tools`,
    };
    this.health.core = toHealthStatus({
      activeChainId: this.config.chainId,
      walletMode: "read-only",
      confirmWrites: false,
      toolCount: 0,
      backends: summarizeBackends(this.health),
    }).core;
    setHealthStatus(this.health, this.toolRecords.size);
  }

  private rebuildToolRegistry(): void {
    this.toolRecords.clear();

    for (const tool of this.frameworkTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, this.getFrameworkSource(tool.name)),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.tokenTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "tokens"),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.lifiTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "lifi"),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.orbsTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "orbs"),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.x402Tools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "x402"),
        handler: (args) => tool.handler(args),
      });
    }
    for (const tool of this.erc8183Tools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "acp"),
        handler: (args) => tool.handler(args),
      });
    }
    for (const tool of this.agdpTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "agdp"),
        handler: (args) => tool.handler(args),
      });
    }
    for (const tool of this.erc8004Tools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "erc8004"),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.blockscoutAdapter.getTools()) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry({ ...tool, category: "explorer" }, "blockscout"),
        handler: (args) =>
          this.blockscoutAdapter.callTool(tool.name, args) as Promise<CallToolResult>,
      });
    }

    for (const tool of this.etherscanAdapter.getTools()) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry({ ...tool, category: "explorer" }, "etherscan"),
        handler: (args) =>
          this.etherscanAdapter.callTool(tool.name, args) as Promise<CallToolResult>,
      });
    }

    for (const tool of this.evmAdapter.getTools()) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry({ ...tool, category: "onchain" }, "evm"),
        handler: (args) => this.evmAdapter.callTool(tool.name, args) as Promise<CallToolResult>,
      });
    }

    const goatSnapshot = this.goatProvider.getReferenceSnapshot();
    if (!goatSnapshot) return;

    for (const tool of goatSnapshot.listOfTools) {
      const goatTool = createGoatToolMetadata(tool);

      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(
          {
            name: goatTool.name,
            description: goatTool.description,
            inputSchema: goatTool.inputSchema,
            category: "onchain",
            annotations: goatTool.annotations,
          },
          "goat",
          true
        ),
        handler: async (args) =>
          dispatchGoatTool(tool.name, args, {
            config: this.config,
            goatProvider: this.goatProvider,
          }),
      });
    }
  }

  private getFrameworkSource(toolName: string): ToolSource {
    if (toolName.startsWith("wallet_")) return "wallet";
    if (toolName.startsWith("transaction_")) return "transaction";
    return "utility";
  }
}

export async function createRuntime(options: CreateRuntimeOptions = {}): Promise<ManagedRuntime> {
  let config: RuntimeConfig;
  try {
    config =
      options.config ?? parseEnv(options.env ?? (process.env as Partial<Record<string, string>>));
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      process.stderr.write(`[web3agent] Invalid config ${error.field}: ${error.message}\n`);
    }
    throw error;
  }

  const pendingOpsRestored = await bootstrapCoreState(config);

  const blockscoutAdapter = new BlockscoutAdapter(config.blockscoutMcpUrl);
  const etherscanAdapter = new EtherscanAdapter(config.etherscanMcpUrl, config.etherscanApiKey);
  const evmAdapter = new EvmAdapter();

  try {
    await blockscoutAdapter.initialize();
  } catch (error: unknown) {
    process.stderr.write(`[web3agent] Blockscout degraded: ${String(error)}\n`);
  }

  try {
    await etherscanAdapter.initialize();
  } catch (error: unknown) {
    process.stderr.write(`[web3agent] Etherscan degraded: ${String(error)}\n`);
  }

  try {
    await evmAdapter.initialize();
  } catch (error: unknown) {
    process.stderr.write(`[web3agent] EVM degraded: ${String(error)}\n`);
  }

  const runtimeGoatProvider = new GoatProvider();
  await runtimeGoatProvider.initialize(config);

  const runtime = new ManagedRuntime(
    config,
    blockscoutAdapter,
    etherscanAdapter,
    evmAdapter,
    runtimeGoatProvider,
    pendingOpsRestored
  );
  runtime.initialize();
  return runtime;
}
