import { prepareOperation, resumeOperation, simulateTransaction } from "web3agent";

const lifecycle = "quote -> simulate -> prepare -> confirm -> execute -> resume -> status";

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

async function main() {
  process.stderr.write(`[mastra-starter] Lifecycle: ${lifecycle}\n`);

  if (process.env.RUN_LIVE_FLOW !== "1") {
    process.stderr.write(
      "[mastra-starter] Set RUN_LIVE_FLOW=1 and provide FLOW_* variables to execute the live prepared-operation example.\n"
    );
    return;
  }

  const prepared = await prepareOperation({
    integration: "lifi",
    kind: "bridge",
    fromChainId: envNumber("FLOW_FROM_CHAIN_ID", 1),
    toChainId: envNumber("FLOW_TO_CHAIN_ID", 8453),
    fromToken: process.env.FLOW_FROM_TOKEN ?? "0x0000000000000000000000000000000000000000",
    toToken: process.env.FLOW_TO_TOKEN ?? "0x0000000000000000000000000000000000000000",
    fromAmount: process.env.FLOW_FROM_AMOUNT ?? "1000000000000000000",
    account: process.env.FLOW_ACCOUNT ?? "",
  });

  process.stdout.write(`${JSON.stringify({ prepared }, null, 2)}\n`);

  if ("completed" in prepared || prepared.actions.length === 0) {
    return;
  }

  const [firstAction] = prepared.actions;
  if (firstAction.type !== "transaction") {
    process.stderr.write(
      `[mastra-starter] First pending action is ${firstAction.type}; execute it externally, then resume with the returned action result.\n`
    );
    return;
  }

  const simulation = await simulateTransaction({
    chainId: firstAction.tx.chainId,
    from: process.env.FLOW_ACCOUNT ?? "",
    to: firstAction.tx.to,
    ...(firstAction.tx.data ? { data: firstAction.tx.data } : {}),
    ...(firstAction.tx.value ? { value: firstAction.tx.value } : {}),
  });

  process.stdout.write(`${JSON.stringify({ simulation }, null, 2)}\n`);
  process.stderr.write(
    "[mastra-starter] After the user confirms and executes the prepared wallet actions, call resumeOperation() with the exact action results to continue the flow.\n"
  );

  const resumePreview = await resumeOperation({
    resumeState: prepared.resumeState,
    actionResults: {},
  });

  process.stdout.write(`${JSON.stringify({ resumePreview }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
