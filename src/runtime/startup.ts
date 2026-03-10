import { ValidationError, parseEnv, setConfig } from "../config/env.js";
import {
  createDefaultHealthStatus,
  createStartupReport,
  formatHealthSummary,
} from "../config/health.js";
import { goatProvider } from "../goat/provider.js";
import { initializeLifi } from "../lifi/config.js";
import { getLifiToolDefinitions, registerLifiExecutors } from "../tools/lifi/index.js";
import { getOrbsToolDefinitions, registerOrbsExecutors } from "../tools/orbs/index.js";
import {
  getTransactionToolDefinitions,
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
} from "../tools/register.js";
import { getTokenToolDefinitions } from "../tools/tokens/index.js";
import { setHealthStatus } from "../tools/utility/index.js";
import type { RuntimeConfig } from "../types/config.js";
import { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import { EtherscanAdapter } from "../upstream/etherscan/adapter.js";
import { EvmAdapter } from "../upstream/evm/adapter.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { walletEvents } from "../wallet/events.js";
import { getWalletState, initializeWallet } from "../wallet/persistence.js";
import { ProxyServer } from "./server.js";

export async function startServer(): Promise<void> {
  let config: RuntimeConfig;
  try {
    config = parseEnv(process.env as Partial<Record<string, string>>);
    setConfig(config);
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
    privateKey: config.privateKey,
    mnemonic: config.mnemonic,
  });

  walletEvents.on("wallet-changed", () => {
    const flushed = confirmationQueue.flushAll();
    if (flushed > 0) {
      process.stderr.write(
        `[web3agent] Wallet changed — flushed ${flushed} pending operation(s) from confirmation queue\n`
      );
    }
  });

  registerOrbsExecutors();
  registerLifiExecutors();
  await confirmationQueue.loadQueue();

  const blockscoutAdapter = new BlockscoutAdapter(config.blockscoutMcpUrl);
  const etherscanAdapter = new EtherscanAdapter(config.etherscanMcpUrl, config.etherscanApiKey);
  const evmAdapter = new EvmAdapter();
  const health = createDefaultHealthStatus();

  try {
    await blockscoutAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.blockscout.status = "degraded";
    health.blockscout.message = message;
    process.stderr.write(`[web3agent] Blockscout degraded: ${message}\n`);
  }

  try {
    await etherscanAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.etherscan.status = "degraded";
    health.etherscan.message = message;
    process.stderr.write(`[web3agent] Etherscan degraded: ${message}\n`);
  }

  try {
    await evmAdapter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialization error";
    health.evm.status = "degraded";
    health.evm.message = message;
    process.stderr.write(`[web3agent] EVM degraded: ${message}\n`);
  }

  await goatProvider.initialize({
    zeroxApiKey: config.zeroxApiKey,
    coingeckoApiKey: config.coingeckoApiKey,
    rpcUrl: config.rpcUrl,
  });

  initializeLifi(config.lifiApiKey);

  const server = new ProxyServer(blockscoutAdapter, etherscanAdapter, evmAdapter, goatProvider);

  const walletMode = getWalletState().mode;
  const goatToolCount = goatProvider.getAllToolNames().length;
  const blockscoutToolCount = blockscoutAdapter.getTools().length;
  const etherscanToolCount = etherscanAdapter.getTools().length;
  const evmToolCount = evmAdapter.getTools().length;
  const lifiToolCount = getLifiToolDefinitions().length;
  const orbsToolCount = getOrbsToolDefinitions().length;
  const tokenToolCount = getTokenToolDefinitions().length;
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
    orbsToolCount +
    tokenToolCount;

  setHealthStatus(health, totalToolCount);

  const degradedServices: string[] = [];
  if (health.blockscout.status !== "ok") degradedServices.push("blockscout");
  if (health.etherscan.status !== "ok" && health.etherscan.status !== "not_configured")
    degradedServices.push("etherscan");
  if (health.evm.status !== "ok") degradedServices.push("evm");

  const report = createStartupReport({
    health,
    activeChainId: config.chainId,
    walletMode,
    confirmWrites: config.confirmWrites,
    degradedServices,
    totalToolCount,
  });

  process.stderr.write(`${formatHealthSummary(report)}\n`);
  process.stderr.write(
    `[web3agent] Tool counts => framework:${frameworkToolCount}, goat:${goatToolCount}, blockscout:${blockscoutToolCount}, etherscan:${etherscanToolCount}, evm:${evmToolCount}, lifi:${lifiToolCount}, orbs:${orbsToolCount}, tokens:${tokenToolCount}\n`
  );

  let shuttingDown = false;
  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write("[web3agent] Shutting down...\n");
    await server.shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  await server.start();
}
