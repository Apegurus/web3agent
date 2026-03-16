import * as readline from "node:readline/promises";
import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { loadConfig } from "./config.js";
import { loadWeb3Tools } from "./tools.js";

const config = loadConfig();
const { tools, runtime } = await loadWeb3Tools();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];

const systemPrompt = `You are a web3 assistant with access to blockchain tools.
Use the available tools to help the user with chain lookups, token resolution,
swaps, bridging, order placement, and other on-chain operations.
When a tool returns an error, explain what went wrong clearly.`;

process.stderr.write(`[playground] Ready — provider: ${config.provider} | type "exit" to quit\n`);

async function shutdown() {
  rl.close();
  await runtime.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown().catch((e: unknown) => {
    process.stderr.write(`[playground] Shutdown error: ${e}\n`);
    process.exit(1);
  });
});

while (true) {
  const userInput = await rl.question("> ");

  if (userInput.trim() === "exit") {
    await shutdown();
    break;
  }

  if (!userInput.trim()) continue;

  messages.push({ role: "user", content: userInput });

  try {
    const result = streamText({
      model: config.model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 10,
      onStepFinish: ({ toolCalls }) => {
        for (const call of toolCalls) {
          process.stderr.write(`  -> ${call.toolName}(${JSON.stringify(call.args)})\n`);
        }
      },
    });

    process.stdout.write("\n");
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n\n");

    messages.push({ role: "assistant", content: await result.text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[playground] Error: ${msg}\n`);
  }
}
