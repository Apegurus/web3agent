import { web3Agent } from "../mastra/agents/web3-agent.js";
import { mastra } from "../mastra/index.js";

async function main() {
  process.stdout.write(
    `${JSON.stringify(
      {
        hasMastra: Boolean(mastra),
        getAgent: typeof mastra.getAgent,
        agentName: web3Agent.name,
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
