import * as readline from "node:readline/promises";
import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { loadConfig } from "./config.js";
import { loadWeb3Tools } from "./tools.js";

const config = loadConfig();
const { runtime, tools } = await loadWeb3Tools();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];
const systemPrompt = `You are a web3 assistant with access to runtime-discovered web3agent tools.
Never invent IDs or transaction hashes. If a write returns a pending confirmation ID,
use that exact ID with transaction_confirm.`;

process.stderr.write(`[starter] Ready on ${config.provider}. Type "exit" to quit.\n`);

try {
  while (true) {
    const input = await rl.question("> ");
    if (input.trim() === "exit") {
      break;
    }
    if (!input.trim()) {
      continue;
    }

    messages.push({ role: "user", content: input });
    const result = streamText({
      model: config.model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 8,
    });

    let output = "";
    for await (const chunk of result.textStream) {
      output += chunk;
      process.stdout.write(chunk);
    }
    process.stdout.write("\n\n");
    messages.push({ role: "assistant", content: output });
  }
} finally {
  rl.close();
  await runtime.shutdown();
}
