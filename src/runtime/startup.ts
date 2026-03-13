import { createStartupReport, formatHealthSummary } from "../config/health.js";
import { createRuntime } from "./managed-runtime.js";
import { ProxyServer } from "./server.js";
import { toHealthStatus } from "./types.js";

export async function startServer(): Promise<void> {
  const runtime = await createRuntime();
  const server = new ProxyServer(runtime);
  const health = runtime.getHealth();

  const report = createStartupReport({
    health: toHealthStatus(health),
    activeChainId: runtime.config.chainId,
    walletMode: health.walletMode,
    walletAddress: health.walletAddress,
    confirmWrites: health.confirmWrites,
    degradedServices: Object.entries(health.backends)
      .filter(([, backend]) => backend.status !== "ok" && backend.status !== "not_configured")
      .map(([name]) => name),
    totalToolCount: health.toolCount,
    pendingOpsRestored: runtime.pendingOpsRestored > 0 ? runtime.pendingOpsRestored : undefined,
  });

  process.stderr.write(`${formatHealthSummary(report)}\n`);

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
