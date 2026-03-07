import type { GetOnChainToolsParams } from "@goat-sdk/adapter-model-context-protocol";
import { getOnChainTools } from "@goat-sdk/adapter-model-context-protocol";
import type { WalletClientBase } from "@goat-sdk/core";
import { viem } from "@goat-sdk/wallet-viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAllChains } from "../chains/registry.js";
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

    const chains = getAllChains();
    for (const chain of chains) {
      try {
        await this.buildSnapshot(chain.id);
      } catch (e: unknown) {
        process.stderr.write(`[web3agent] GOAT snapshot failed for chain ${chain.id}: ${e}\n`);
      }
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

  getSnapshot(chainId: number): GoatToolSnapshot | undefined {
    return this.snapshots.get(chainId);
  }

  getAllToolNames(): string[] {
    const names = new Set<string>();
    for (const [, snapshot] of this.snapshots) {
      for (const tool of snapshot.listOfTools) {
        names.add(tool.name);
      }
    }
    return [...names];
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
