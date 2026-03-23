import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { BlockscoutClient as ExplorerBlockscoutClient } from "../api/explorer/blockscout/client.js";
import { EtherscanClient as ExplorerEtherscanClient } from "../api/explorer/etherscan/client.js";
import { ExplorerRouter } from "../api/explorer/router.js";
import { ValidationError, parseEnv, withConfig } from "../config/env.js";
import { createDefaultHealthStatus } from "../config/health.js";
import { dispatchGoatTool } from "../goat/dispatch.js";
import { GoatProvider } from "../goat/provider.js";
import { initializeLifi } from "../lifi/config.js";
import {
  getCachedBalanceUsd,
  refreshBalanceUsd,
  resetBalanceCache,
} from "../policy/balance-cache.js";
import { resolvePolicy } from "../policy/config.js";
import { evaluatePolicy } from "../policy/engine.js";
import { extractEstimatedUsd } from "../policy/extract-usd.js";
import { loadSpendLog, recordSpend } from "../policy/spend-tracker.js";
import type { RiskLevel } from "../policy/types.js";
import {
  getAcpToolDefinitions as getAcpVirtualsToolDefinitions,
  registerAcpExecutors as registerAcpVirtualsExecutors,
} from "../tools/acp-virtuals/index.js";
import { getErc8183ToolDefinitions, registerErc8183Executors } from "../tools/acp/index.js";
import { getAgdpToolDefinitions, registerAgdpExecutors } from "../tools/agdp/index.js";
import { getErc8004ToolDefinitions, registerErc8004Executors } from "../tools/erc8004/index.js";
import { getEvmToolDefinitions, registerEvmExecutors } from "../tools/evm/index.js";
import { type ExplorerDeps, getExplorerToolDefinitions } from "../tools/explorer/index.js";
import { getLifiToolDefinitions, registerLifiExecutors } from "../tools/lifi/index.js";
import { getMarketToolDefinitions } from "../tools/market/index.js";
import { getOperationToolDefinitions } from "../tools/operations/index.js";
import { getOrbsToolDefinitions, registerOrbsExecutors } from "../tools/orbs/index.js";
import { getPolicyToolDefinitions } from "../tools/policy/index.js";
import {
  type ToolDefinition,
  getTransactionToolDefinitions,
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
} from "../tools/register.js";
import { getResearchToolDefinitions } from "../tools/research/index.js";
import { getTokenToolDefinitions } from "../tools/tokens/index.js";
import { setHealthStatus } from "../tools/utility/index.js";
import { getX402ToolDefinitions, registerX402Executors } from "../tools/x402/index.js";
import type { RuntimeConfig } from "../types/config.js";
import type { HealthStatus } from "../types/health.js";
import { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import { EtherscanAdapter } from "../upstream/etherscan/adapter.js";
import { formatToolError } from "../utils/errors.js";
import { sanitizeToolInput } from "../utils/sanitize.js";
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
    riskLevel?: RiskLevel;
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
    riskLevel: tool.riskLevel ?? "safe",
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
  registerAcpVirtualsExecutors();
  registerAgdpExecutors();
  registerErc8004Executors();
  registerEvmExecutors();
  initializeLifi(config.lifiApiKey);
  await loadSpendLog();

  const wallet = getWalletState();
  if (wallet.address) {
    refreshBalanceUsd(wallet.address, wallet.chainId).catch((e: unknown) => {
      process.stderr.write(`[web3agent] Initial balance refresh failed: ${e}\n`);
    });
  }

  return confirmationQueue.loadQueue();
}

function summarizeBackends(health: HealthStatus): RuntimeHealth["backends"] {
  return {
    explorer: { ...health.explorer },
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
  private readonly acpVirtualsTools: ToolDefinition[];
  private readonly agdpTools: ToolDefinition[];
  private readonly erc8004Tools: ToolDefinition[];
  private readonly evmTools: ToolDefinition[];
  private readonly policyTools: ToolDefinition[];
  private readonly explorerDeps: ExplorerDeps;
  private explorerToolCount = 0;
  private readonly marketTools = getMarketToolDefinitions();
  private readonly researchTools = getResearchToolDefinitions();
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
    goatProvider: GoatProvider,
    explorerDeps: ExplorerDeps,
    pendingOpsRestored: number
  ) {
    this.goatProvider = goatProvider;
    this.explorerDeps = explorerDeps;
    this.pendingOpsRestored = pendingOpsRestored;
    this.frameworkTools = [
      ...getWalletToolDefinitions(),
      ...getOperationToolDefinitions(),
      ...getTransactionToolDefinitions(),
      ...getUtilityToolDefinitions(),
    ];
    this.lifiTools = getLifiToolDefinitions();
    this.orbsTools = getOrbsToolDefinitions();
    this.tokenTools = getTokenToolDefinitions();
    this.x402Tools = getX402ToolDefinitions();
    this.erc8183Tools = getErc8183ToolDefinitions();
    this.acpVirtualsTools = getAcpVirtualsToolDefinitions();
    this.agdpTools = getAgdpToolDefinitions();
    this.erc8004Tools = getErc8004ToolDefinitions();
    this.evmTools = getEvmToolDefinitions();
    this.policyTools = getPolicyToolDefinitions();
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
      resetBalanceCache();
      const wallet = getWalletState();
      if (wallet.address) {
        refreshBalanceUsd(wallet.address, wallet.chainId).catch((e: unknown) => {
          process.stderr.write(`[web3agent] Failed to refresh wallet balance: ${e}\n`);
        });
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

    const sanitization = sanitizeToolInput(args, tool.riskLevel);
    if (!sanitization.safe) {
      return formatToolError("INPUT_BLOCKED", "Input blocked by injection defense", {
        threats: sanitization.threats.map((t) => ({
          check: t.check,
          severity: t.severity,
          detail: t.detail,
        })),
      });
    }
    if (sanitization.threats.length > 0) {
      process.stderr.write(
        `[web3agent] Input warning for ${name}: ${sanitization.threats.map((t) => t.check).join(", ")}\n`
      );
    }

    const isFinancial = tool.riskLevel === "financial";
    const rawEstimatedUsd = isFinancial ? await extractEstimatedUsd(args) : null;

    if (isFinancial) {
      if (rawEstimatedUsd === 0) {
        // Token fields were present but estimation failed (price feed down, unknown token)
        process.stderr.write(
          `[web3agent] Denied financial tool "${name}" — USD estimation failed for spend-limit enforcement\n`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: false,
                error: {
                  code: "SPEND_LIMIT_ERROR",
                  message: `Cannot execute financial tool "${name}" without a USD estimate. Ensure the token is recognized and price feeds are available.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }
      if (rawEstimatedUsd === null) {
        // Gas-only tool (cancel, approve, generic write) — no token fields to estimate
        process.stderr.write(
          `[web3agent] Allowing gas-only financial tool "${name}" — no token amount fields to estimate\n`
        );
      }
      const decision = evaluatePolicy(resolvePolicy(this.config), {
        toolName: name,
        riskLevel: tool.riskLevel,
        estimatedUsd: rawEstimatedUsd ?? 0,
        walletBalanceUsd: getCachedBalanceUsd(),
      });

      if (decision.action === "deny") {
        return formatToolError("POLICY_DENIED", decision.message, {
          reasonCode: decision.reasonCode,
          currentSpend: decision.currentSpend,
          limits: {
            maxSingleTransactionUsd: decision.appliedPolicy.maxSingleTransactionUsd,
            maxHourlyUsd: decision.appliedPolicy.maxHourlyUsd,
            maxDailyUsd: decision.appliedPolicy.maxDailyUsd,
          },
        });
      }
    }

    try {
      const result = await withConfig(this.config, () => tool.handler(args));
      const normalized = normalizeCallToolResult(result);

      if (isFinancial && !normalized.isError) {
        const payload = getToolResultPayload(normalized);
        const isPendingConfirmation =
          payload !== null &&
          typeof payload === "object" &&
          "status" in payload &&
          payload.status === "pending_confirmation";

        if (!isPendingConfirmation) {
          recordSpend(name, rawEstimatedUsd ?? 0, getWalletState().address);
        }
      }

      return normalized;
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
    await Promise.allSettled([this.blockscoutAdapter.shutdown(), this.etherscanAdapter.shutdown()]);
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
    // Unified explorer health (tool count cached from registration)
    const explorerToolCount = this.explorerToolCount;
    const bsChainCount = this.explorerDeps.blockscout.getSupportedChainIds().length;
    const esChainCount = this.explorerDeps.etherscan?.getSupportedChainIds().length ?? 0;
    const esConfigured = this.explorerDeps.etherscan != null;
    const bsStatus = bsChainCount > 0 ? "ok" : "degraded";
    const esStatus = esConfigured ? (esChainCount > 0 ? "ok" : "degraded") : "not_configured";
    const overallStatus = bsChainCount > 0 || esChainCount > 0 ? "ok" : "unavailable";
    this.health.explorer = {
      name: "block-explorer",
      status: overallStatus,
      toolCount: explorerToolCount,
      message: `${explorerToolCount} tools, ${bsChainCount + esChainCount} chains`,
      backends: {
        blockscout: { status: bsStatus, chainCount: bsChainCount },
        etherscan: {
          status: esStatus,
          chainCount: esChainCount,
          message: esConfigured ? undefined : "No API key provided",
        },
      },
    };
    // Legacy adapter health (kept until adapter removal)
    this.health.blockscout = this.blockscoutAdapter.getHealth();
    this.health.etherscan = this.etherscanAdapter.getHealth();
    this.health.evm = {
      name: "evm",
      status: "ok",
      toolCount: this.evmTools.length,
      message: `Loaded ${this.evmTools.length} native tools`,
    };
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
      this.acpVirtualsTools.length +
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

    for (const tool of this.policyTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "utility"),
        handler: (args) => tool.handler(args),
      });
    }

    const toolGroups: Array<[ToolSource, ToolDefinition[]]> = [
      ["x402", this.x402Tools],
      ["acp", this.erc8183Tools],
      ["acp", this.acpVirtualsTools],
      ["agdp", this.agdpTools],
      ["erc8004", this.erc8004Tools],
      ["market", this.marketTools],
      ["research", this.researchTools],
    ];
    for (const [source, tools] of toolGroups) {
      for (const tool of tools) {
        this.toolRecords.set(tool.name, {
          ...toCatalogEntry(tool, source),
          handler: (args) => tool.handler(args),
        });
      }
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

    const explorerTools = getExplorerToolDefinitions(this.explorerDeps);
    this.explorerToolCount = explorerTools.length;
    for (const tool of explorerTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "explorer"),
        handler: (args) => tool.handler(args),
      });
    }

    for (const tool of this.evmTools) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "evm"),
        handler: (args) => tool.handler(args),
      });
    }

    const goatSnapshot = this.goatProvider.getReferenceSnapshot();
    if (!goatSnapshot) return;

    for (const tool of goatSnapshot.listOfTools) {
      const goatTool = createGoatToolMetadata(tool);
      const goatRiskLevel: RiskLevel = goatTool.annotations?.destructiveHint ? "financial" : "safe";

      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(
          {
            name: goatTool.name,
            description: goatTool.description,
            inputSchema: goatTool.inputSchema,
            category: "onchain",
            riskLevel: goatRiskLevel,
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
    if (toolName.startsWith("operation_")) return "operation";
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

  const runtimeGoatProvider = new GoatProvider();
  await runtimeGoatProvider.initialize(config);

  const explorerBlockscout = new ExplorerBlockscoutClient();
  const explorerEtherscan = config.etherscanApiKey
    ? new ExplorerEtherscanClient(config.etherscanApiKey, config.etherscanApiUrl)
    : undefined;
  const explorerRouter = new ExplorerRouter(
    explorerBlockscout.getSupportedChainIds(),
    explorerEtherscan?.getSupportedChainIds() ?? []
  );
  const explorerDeps: ExplorerDeps = {
    router: explorerRouter,
    blockscout: explorerBlockscout,
    etherscan: explorerEtherscan,
  };

  const runtime = new ManagedRuntime(
    config,
    blockscoutAdapter,
    etherscanAdapter,
    runtimeGoatProvider,
    explorerDeps,
    pendingOpsRestored
  );
  runtime.initialize();
  return runtime;
}
