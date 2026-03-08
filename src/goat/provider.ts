import type { GetOnChainToolsParams } from "@goat-sdk/adapter-model-context-protocol";
import { getOnChainTools } from "@goat-sdk/adapter-model-context-protocol";
import type { WalletClientBase } from "@goat-sdk/core";
import { viem } from "@goat-sdk/wallet-viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClientForChain } from "../config/wallet-factory.js";
import { getActiveAccount, getWalletState } from "../wallet/persistence.js";
import { type PluginLoadResult, loadPlugins } from "./plugins.js";

export interface GoatToolSnapshot {
  listOfTools: Array<{
    name: string;
    description: string;
    inputSchema: object;
  }>;
  toolHandler: (
    toolName: string,
    params: unknown
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  chainId: number;
}

export class GoatProvider {
  private snapshots = new Map<number, GoatToolSnapshot>();
  private pluginResult: PluginLoadResult | undefined;
  private referenceSnapshot: GoatToolSnapshot | undefined;

  async initialize(config: {
    zeroxApiKey?: string;
    coingeckoApiKey?: string;
    rpcUrl?: string;
  }): Promise<void> {
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

    const walletClient = createWalletClientForChain(account, chainId);
    const tools = await getOnChainTools({
      wallet: viem(walletClient),
      plugins: this.pluginResult.plugins,
      // biome-ignore lint/suspicious/noExplicitAny: GOAT SDK generics require flexible typing for cross-plugin wallet compat
    } as GetOnChainToolsParams<any>);

    this.snapshots.set(chainId, {
      listOfTools: tools.listOfTools(),
      toolHandler: tools.toolHandler,
      chainId,
    });
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
