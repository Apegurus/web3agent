import { zeroEx } from "@goat-sdk/plugin-0x";
import { balancer } from "@goat-sdk/plugin-balancer";
import { coingecko } from "@goat-sdk/plugin-coingecko";
import { dexscreener } from "@goat-sdk/plugin-dexscreener";
import { ens } from "@goat-sdk/plugin-ens";
import { USDC, WETH, erc20 } from "@goat-sdk/plugin-erc20";
import { uniswap } from "@goat-sdk/plugin-uniswap";

export interface PluginLoadResult {
  plugins: unknown[];
  loadedTier0: string[];
  loadedTier1: string[];
  loadedTier2: string[];
  failedPlugins: Array<{ name: string; error: string }>;
}

export function loadPlugins(options: {
  hasWallet: boolean;
  zeroxApiKey?: string;
  coingeckoApiKey?: string;
  rpcUrl?: string;
}): PluginLoadResult {
  const result: PluginLoadResult = {
    plugins: [],
    loadedTier0: [],
    loadedTier1: [],
    loadedTier2: [],
    failedPlugins: [],
  };

  // Tier 0: Always loaded — no API keys required
  const tier0: Array<{ name: string; factory: () => unknown }> = [
    {
      name: "erc20",
      factory: () => erc20({ tokens: [USDC, WETH] }),
    },
    {
      name: "ens",
      factory: () => ens({}),
    },
    {
      name: "dexscreener",
      factory: () => dexscreener(),
    },
  ];

  for (const { name, factory } of tier0) {
    try {
      result.plugins.push(factory());
      result.loadedTier0.push(name);
    } catch (e: unknown) {
      process.stderr.write(`[web3agent] GOAT plugin ${name} failed to load: ${e}\n`);
      result.failedPlugins.push({ name, error: String(e) });
    }
  }

  // Tier 1: Wallet + API key required
  if (options.hasWallet) {
    const tier1: Array<{
      name: string;
      factory: () => unknown;
      condition: boolean;
    }> = [
      {
        name: "uniswap",
        factory: () =>
          uniswap({
            apiKey: "default",
            baseUrl: "https://api.uniswap.org",
          }),
        condition: true,
      },
      {
        name: "balancer",
        factory: () => balancer({ rpcUrl: options.rpcUrl ?? "https://eth.llamarpc.com" }),
        condition: true,
      },
    ];

    for (const { name, factory, condition } of tier1) {
      if (!condition) continue;
      try {
        result.plugins.push(factory());
        result.loadedTier1.push(name);
      } catch (e: unknown) {
        process.stderr.write(`[web3agent] GOAT plugin ${name} failed to load: ${e}\n`);
        result.failedPlugins.push({ name, error: String(e) });
      }
    }
  }

  // Tier 2: Specific API keys required
  if (options.coingeckoApiKey) {
    try {
      result.plugins.push(coingecko({ apiKey: options.coingeckoApiKey }));
      result.loadedTier2.push("coingecko");
    } catch (e: unknown) {
      process.stderr.write(`[web3agent] GOAT plugin coingecko failed to load: ${e}\n`);
      result.failedPlugins.push({ name: "coingecko", error: String(e) });
    }
  }

  if (options.zeroxApiKey) {
    try {
      result.plugins.push(zeroEx({ apiKey: options.zeroxApiKey }));
      result.loadedTier2.push("0x");
    } catch (e: unknown) {
      process.stderr.write(`[web3agent] GOAT plugin 0x failed to load: ${e}\n`);
      result.failedPlugins.push({ name: "0x", error: String(e) });
    }
  }

  return result;
}
