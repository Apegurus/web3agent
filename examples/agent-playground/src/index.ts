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
When a tool returns an error, explain what went wrong clearly.`;

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
      onStepFinish: ({ toolCalls }) => {
        for (const call of toolCalls) {
          process.stderr.write(`  -> ${call.toolName}(${JSON.stringify(call.args)})\n`);
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
