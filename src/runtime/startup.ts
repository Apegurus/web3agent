import { ValidationError, getConfig, parseEnv } from "../config/env.js";
import {
  createDefaultHealthStatus,
  createStartupReport,
  formatHealthSummary,
} from "../config/health.js";
import { goatProvider } from "../goat/provider.js";
import { initializeLifi } from "../lifi/config.js";
import { getLifiToolDefinitions } from "../tools/lifi/index.js";
import { getOrbsToolDefinitions } from "../tools/orbs/index.js";
import {
  getTransactionToolDefinitions,
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
} from "../tools/register.js";
import { setHealthStatus } from "../tools/utility/index.js";
import type { RuntimeConfig } from "../types/config.js";
import { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import { EtherscanAdapter } from "../upstream/etherscan/adapter.js";
import { EvmAdapter } from "../upstream/evm/adapter.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { getWalletState, initializeWallet } from "../wallet/persistence.js";
import { ProxyServer } from "./server.js";

export async function startServer(): Promise<void> {
  let config: RuntimeConfig;
  try {
    config = parseEnv(process.env as Partial<Record<string, string>>);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      process.stderr.write(`[web3agent] Invalid config ${error.field}: ${error.message}\n`);
      process.exit(1);
    }

    throw error;
  }

  confirmationQueue.enabled = config.confirmWrites;

  await initializeWallet({
    chainId: config.chainId,
    accountIndex: config.walletAccountIndex,
    addressIndex: config.walletAddressIndex,
  });

  const blockscoutAdapter = new BlockscoutAdapter(config.blockscoutMcpUrl);
  const etherscanAdapter = new EtherscanAdapter(config.etherscanMcpUrl, config.etherscanApiKey);
  const evmAdapter = new EvmAdapter();
  const health = createDefaultHealthStatus();
  const degradedServices: string[] = [];

  try {
    await blockscoutAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.blockscout.status = "degraded";
    health.blockscout.message = message;
    degradedServices.push("blockscout");
    process.stderr.write(`[web3agent] Blockscout degraded: ${message}\n`);
  }

  try {
    await etherscanAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.etherscan.status = "degraded";
    health.etherscan.message = message;
    degradedServices.push("etherscan");
    process.stderr.write(`[web3agent] Etherscan degraded: ${message}\n`);
  }

  try {
    await evmAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.evm.status = "degraded";
    health.evm.message = message;
    degradedServices.push("evm");
    process.stderr.write(`[web3agent] EVM degraded: ${message}\n`);
  }

  await goatProvider.initialize({
    zeroxApiKey: config.zeroxApiKey,
    coingeckoApiKey: config.coingeckoApiKey,
    rpcUrl: config.rpcUrl,
  });

  initializeLifi(config.lifiApiKey);

  const server = new ProxyServer(blockscoutAdapter, etherscanAdapter, evmAdapter, goatProvider);

  const runtimeConfig = getConfig();
  const walletMode = getWalletState().mode;
  const goatToolCount = goatProvider.getAllToolNames().length;
  const blockscoutToolCount = blockscoutAdapter.getTools().length;
  const etherscanToolCount = etherscanAdapter.getTools().length;
  const evmToolCount = evmAdapter.getTools().length;
  const lifiToolCount = getLifiToolDefinitions().length;
  const orbsToolCount = getOrbsToolDefinitions().length;
  const frameworkToolCount =
    getWalletToolDefinitions().length +
    getTransactionToolDefinitions().length +
    getUtilityToolDefinitions().length;

  health.blockscout = blockscoutAdapter.getHealth();
  health.etherscan = etherscanAdapter.getHealth();
  health.evm = evmAdapter.getHealth();
  health.goat = {
    name: "goat",
    status: "ok",
    toolCount: goatToolCount,
    message: `Loaded ${goatToolCount} tools`,
  };
  health.lifi = {
    name: "lifi",
    status: "ok",
    toolCount: lifiToolCount,
    message: `Loaded ${lifiToolCount} tools`,
  };
  health.orbs = {
    name: "orbs",
    status: "ok",
    toolCount: orbsToolCount,
    message: `Loaded ${orbsToolCount} tools`,
  };

  const totalToolCount =
    frameworkToolCount +
    goatToolCount +
    blockscoutToolCount +
    etherscanToolCount +
    evmToolCount +
    lifiToolCount +
    orbsToolCount;

  setHealthStatus(health, totalToolCount);

  if (health.blockscout.status !== "ok") degradedServices.push("blockscout");
  if (health.etherscan.status !== "ok" && health.etherscan.status !== "not_configured")
    degradedServices.push("etherscan");
  if (health.evm.status !== "ok") degradedServices.push("evm");

  const report = createStartupReport({
    health,
    activeChainId: runtimeConfig.chainId,
    walletMode,
    confirmWrites: runtimeConfig.confirmWrites,
    degradedServices: [...new Set(degradedServices)],
    totalToolCount,
  });

  process.stderr.write(`${formatHealthSummary(report)}\n`);
  process.stderr.write(
    `[web3agent] Tool counts => framework:${frameworkToolCount}, goat:${goatToolCount}, blockscout:${blockscoutToolCount}, etherscan:${etherscanToolCount}, evm:${evmToolCount}, lifi:${lifiToolCount}, orbs:${orbsToolCount}\n`
  );

  await server.start();
}
