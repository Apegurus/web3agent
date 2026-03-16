import * as readline from "node:readline/promises";
import { generateText } from "ai";
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
    const result = await generateText({
      model: config.model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 10,
    });

    messages.push({ role: "assistant", content: result.text });
    console.log(`\n${result.text}\n`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[playground] Error: ${msg}\n`);
  }
}
