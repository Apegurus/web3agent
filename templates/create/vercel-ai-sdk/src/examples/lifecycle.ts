import { createRuntime } from "web3agent/runtime";

const LIFECYCLE = "quote -> simulate -> prepare -> confirm -> execute -> resume -> status";

async function main() {
  process.stderr.write(`[starter] Lifecycle: ${LIFECYCLE}\n`);
  process.stderr.write(
    "[starter] This example demonstrates the canonical queued write flow: lifi_execute_bridge -> transaction_confirm.\n"
  );
  process.stderr.write(
    "[starter] When the live flow queues an operation, confirm it with transaction_confirm using the exact returned id.\n"
  );

  if (process.env.RUN_LIVE_FLOW !== "1") {
    process.stderr.write(
      "[starter] Set RUN_LIVE_FLOW=1 and provide wallet / LI.FI env configuration to execute the live example.\n"
    );
    return;
  }

  const runtime = await createRuntime();
  try {
    const queued = await runtime.invokeTool("lifi_execute_bridge", {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: "0x0000000000000000000000000000000000000000",
      toToken: "0x0000000000000000000000000000000000000000",
      fromAmount: "1000000000000000000",
    });

    process.stdout.write(`${JSON.stringify(queued.structuredContent ?? queued, null, 2)}\n`);
    process.stderr.write(
      "[starter] Confirm the queued operation with transaction_confirm using the exact returned id.\n"
    );
  } finally {
    await runtime.shutdown();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
