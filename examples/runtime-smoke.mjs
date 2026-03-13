import { createRuntime } from "web3agent/runtime";

const shouldRun = process.argv.includes("--run");

if (!shouldRun) {
  process.stdout.write(
    `${JSON.stringify(
      {
        createRuntime: typeof createRuntime,
        mode: "imports-only",
        hint: "Pass --run to start the live runtime smoke test.",
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}

let runtime;

try {
  runtime = await createRuntime();
  const health = runtime.getHealth();
  const toolPreview = runtime
    .listTools()
    .slice(0, 10)
    .map((tool) => ({
      name: tool.name,
      source: tool.source,
      category: tool.category,
      dynamic: tool.dynamic,
    }));
  const supportedChains = await runtime.invokeTool("list_supported_chains");
  const supportedChainsPayload = supportedChains.structuredContent;

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "live-runtime",
        health: {
          activeChainId: health.activeChainId,
          walletMode: health.walletMode,
          toolCount: health.toolCount,
          backends: Object.fromEntries(
            Object.entries(health.backends).map(([name, backend]) => [name, backend.status])
          ),
        },
        toolPreview,
        supportedChains:
          supportedChainsPayload?.ok === true
            ? supportedChainsPayload.data
            : supportedChainsPayload?.ok === false
              ? supportedChainsPayload.error
              : supportedChains,
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(
    `[runtime-smoke] Failed to start live runtime: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.stderr.write(
    "[runtime-smoke] This path requires live adapter initialization and network access.\n"
  );
  process.exitCode = 1;
} finally {
  if (runtime) {
    await runtime.shutdown().catch((error) => {
      process.stderr.write(
        `[runtime-smoke] Failed to shut down runtime cleanly: ${error instanceof Error ? error.message : String(error)}\n`
      );
    });
  }
}
