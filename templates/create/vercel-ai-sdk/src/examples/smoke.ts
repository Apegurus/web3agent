import { createRuntime } from "web3agent/runtime";

async function main() {
  const runtime = await createRuntime();
  try {
    const tools = runtime
      .listTools()
      .slice(0, 5)
      .map((tool) => tool.name);
    process.stdout.write(
      `${JSON.stringify({ toolCount: runtime.listTools().length, tools }, null, 2)}\n`
    );
  } finally {
    await runtime.shutdown();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
