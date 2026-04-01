import { createRuntime } from "web3agent/runtime";

const flow = "lifi_execute_bridge -> transaction_confirm";

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

async function main() {
  process.stderr.write(`[mcp-host-starter] Lifecycle: ${flow}\n`);

  if (process.env.RUN_LIVE_FLOW !== "1") {
    process.stderr.write(
      "[mcp-host-starter] Set RUN_LIVE_FLOW=1 to execute the live queued write example.\n"
    );
    return;
  }

  const runtime = await createRuntime();
  try {
    const queued = await runtime.invokeTool("lifi_execute_bridge", {
      fromChainId: envNumber("FLOW_FROM_CHAIN_ID", 1),
      toChainId: envNumber("FLOW_TO_CHAIN_ID", 8453),
      fromToken: process.env.FLOW_FROM_TOKEN ?? "0x0000000000000000000000000000000000000000",
      toToken: process.env.FLOW_TO_TOKEN ?? "0x0000000000000000000000000000000000000000",
      fromAmount: process.env.FLOW_FROM_AMOUNT ?? "1000000000000000000",
    });

    process.stdout.write(
      `${JSON.stringify({ queued: queued.structuredContent ?? queued }, null, 2)}\n`
    );
    process.stderr.write(
      "[mcp-host-starter] Confirm the queued operation with transaction_confirm using the exact returned id.\n"
    );
  } finally {
    await runtime.shutdown();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
