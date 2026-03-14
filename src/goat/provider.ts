import type { WalletClientBase } from "@goat-sdk/core";
import { viem } from "@goat-sdk/wallet-viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClientForChain } from "../config/wallet-factory.js";
import type { RuntimeConfig } from "../types/config.js";
import { walletEvents } from "../wallet/events.js";
import { getActiveAccount, getWalletState } from "../wallet/persistence.js";
import { type PluginLoadResult, loadPlugins } from "./plugins.js";
import { type GoatToolSnapshot, buildGoatTools, createGoatToolSnapshot } from "./toolset.js";

export class GoatProvider {
  private snapshots = new Map<number, GoatToolSnapshot>();
  private pluginResult: PluginLoadResult | undefined;
  private referenceSnapshot: GoatToolSnapshot | undefined;
  private generation = 0;
  private runtimeConfig?: RuntimeConfig;
  private walletChangeHandler?: (state: import("../types/wallet.js").WalletState) => void;
  private rebuildPromise: Promise<void> = Promise.resolve();

  async initialize(config: RuntimeConfig): Promise<void> {
    this.runtimeConfig = config;
    const walletState = getWalletState();
    const hasWallet = walletState.mode !== "read-only";

    this.pluginResult = loadPlugins({
      hasWallet,
      zeroxApiKey: config.zeroxApiKey,
      coingeckoApiKey: config.coingeckoApiKey,
      rpcUrl: config.rpcUrl,
    });

    const defaultChainId = walletState.chainId;
    await this.buildSnapshot(defaultChainId);
    this.referenceSnapshot = this.snapshots.get(defaultChainId);

    this.walletChangeHandler = (state) => {
      this.generation++;
      const gen = this.generation;
      const hasWallet = state.mode !== "read-only";
      this.pluginResult = loadPlugins({
        hasWallet,
        zeroxApiKey: this.runtimeConfig?.zeroxApiKey,
        coingeckoApiKey: this.runtimeConfig?.coingeckoApiKey,
        rpcUrl: this.runtimeConfig?.rpcUrl,
      });
      // Chain onto existing promise so waitForRebuild() always awaits the latest.
      // Keep old referenceSnapshot visible until new one is ready (no availability gap).
      this.rebuildPromise = this.rebuildPromise
        // biome-ignore lint/suspicious/noEmptyBlockStatements: intentionally swallow previous rebuild errors to keep the chain alive
        .catch(() => {})
        .then(() => this.buildSnapshot(state.chainId))
        .then(() => {
          if (this.generation !== gen) return;
          this.referenceSnapshot = this.snapshots.get(state.chainId);
          process.stderr.write(
            `[goat] Rebuilt snapshot for chain ${state.chainId} after wallet change\n`
          );
        })
        .catch((e: unknown) => {
          process.stderr.write(`[goat] Failed to rebuild snapshot after wallet change: ${e}\n`);
        });
    };
    walletEvents.on("wallet-changed", this.walletChangeHandler);
  }

  /** Wait for any in-flight rebuild triggered by a wallet change. */
  async waitForRebuild(): Promise<void> {
    await this.rebuildPromise;
  }

  shutdown(): void {
    if (this.walletChangeHandler) {
      walletEvents.off("wallet-changed", this.walletChangeHandler);
      this.walletChangeHandler = undefined;
    }
  }

  private async buildSnapshot(chainId: number): Promise<void> {
    if (!this.pluginResult) {
      throw new Error("GoatProvider not initialized — call initialize() first");
    }

    // biome-ignore lint/suspicious/noExplicitAny: GOAT SDK requires LocalAccount; getActiveAccount returns broader Account type
    let account: any;
    const walletState = getWalletState();
    if (walletState.mode !== "read-only") {
      account = getActiveAccount();
    } else {
      const ephemeralKey = generatePrivateKey();
      account = privateKeyToAccount(ephemeralKey);
    }

    const walletClient = createWalletClientForChain(account, chainId, this.runtimeConfig);
    const tools = await buildGoatTools({
      wallet: viem(walletClient) as unknown as WalletClientBase,
      pluginResult: this.pluginResult,
    });

    this.snapshots.set(chainId, createGoatToolSnapshot(chainId, tools));
  }

  async getOrBuildSnapshot(chainId: number): Promise<GoatToolSnapshot | undefined> {
    const existing = this.snapshots.get(chainId);
    if (existing) return existing;

    try {
      await this.buildSnapshot(chainId);
      return this.snapshots.get(chainId);
    } catch (e: unknown) {
      process.stderr.write(`[web3agent] GOAT snapshot failed for chain ${chainId}: ${e}\n`);
      return undefined;
    }
  }

  getReferenceSnapshot(): GoatToolSnapshot | undefined {
    return this.referenceSnapshot;
  }

  getAllToolNames(): string[] {
    if (this.referenceSnapshot) {
      return this.referenceSnapshot.listOfTools.map((t) => t.name);
    }
    return [];
  }

  getLoadedPlugins(): string[] {
    if (!this.pluginResult) return [];
    return [
      ...this.pluginResult.loadedTier0,
      ...this.pluginResult.loadedTier1,
      ...this.pluginResult.loadedTier2,
    ];
  }
}

export const goatProvider = new GoatProvider();
