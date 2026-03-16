import * as readline from "node:readline/promises";
import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { loadConfig } from "./config.js";
import { loadWeb3Tools } from "./tools.js";

const MAX_TOOL_STEPS = 10;

const config = loadConfig();
const { tools, runtime } = await loadWeb3Tools();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];
let running = true;

const systemPrompt = `You are a web3 assistant with access to blockchain tools.
Use the available tools to help the user with chain lookups, token resolution,
swaps, bridging, order placement, and other on-chain operations.

CRITICAL RULES:
- NEVER invent, guess, or fabricate data. Only use values returned by tools.
- When a tool returns an operation ID, transaction hash, address, or any identifier,
  use the EXACT value from the tool response. Never generate fake IDs.
- When a write operation is queued for confirmation, extract the real ID from the
  tool result and present it to the user. Then call transaction_confirm with that
  exact ID to confirm it.
- When a tool returns an error, explain what went wrong clearly and do not retry
  the same call more than once without changing parameters.
- If a policy limit blocks a transaction, explain the limit once and ask the user
  how they want to proceed. Do not keep retrying with the same amount.`;

process.stderr.write(`[playground] Ready — provider: ${config.provider} | type "exit" to quit\n\n`);

async function shutdown() {
  running = false;
  rl.close();
  await runtime.shutdown();
}

process.on("SIGINT", () => {
  shutdown().catch((e: unknown) => {
    process.stderr.write(`[playground] Shutdown error: ${e}\n`);
    process.exit(1);
  });
});

function setInputEnabled(enabled: boolean) {
  if (enabled) {
    process.stdin.resume();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } else {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.pause();
  }
}

while (running) {
  const userInput = await rl.question("> ").catch(() => "exit");

  if (!running || userInput.trim() === "exit") {
    await shutdown();
    break;
  }

  if (!userInput.trim()) continue;

  messages.push({ role: "user", content: userInput });
  setInputEnabled(false);

  try {
    process.stdout.write("\n");

    const result = streamText({
      model: config.model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: MAX_TOOL_STEPS,
      onStepFinish: (event) => {
        for (const call of event.toolCalls) {
          process.stderr.write(`  -> ${call.toolName}(${JSON.stringify(call.args)})\n`);
        }
        const toolResults = (event as Record<string, unknown>).toolResults as
          | Array<{ result: unknown }>
          | undefined;
        for (const result of toolResults ?? []) {
          const data = typeof result.result === "object" ? result.result : null;
          if (!data) continue;
          const payload = data as Record<string, unknown>;
          if (payload.ok === false) {
            process.stderr.write(`  <- ERROR: ${JSON.stringify(payload.error)}\n`);
          } else if (payload.ok === true && payload.data) {
            const inner = payload.data as Record<string, unknown>;
            if (inner.queued) {
              process.stderr.write(`  <- QUEUED: id=${inner.id} — ${inner.summary}\n`);
            } else if (inner.txHash || inner.transactionHash) {
              process.stderr.write(
                `  <- TX: ${(inner.txHash ?? inner.transactionHash) as string}\n`
              );
            }
          }
        }
      },
    });

    let hasOutput = false;
    for await (const chunk of result.textStream) {
      hasOutput = true;
      process.stdout.write(chunk);
    }
    if (hasOutput) process.stdout.write("\n");
    process.stdout.write("\n");

    messages.push({ role: "assistant", content: await result.text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[playground] Error: ${msg}\n\n`);
  } finally {
    setInputEnabled(true);
  }
}
