import { createRuntime } from "../runtime/managed-runtime.js";
import type { Web3AgentRuntime } from "../runtime/types.js";
import { CliExitError } from "./output.js";

export async function createCliRuntime(): Promise<Web3AgentRuntime> {
  return createRuntime();
}

export async function withCliRuntime<T>(
  run: (runtime: Web3AgentRuntime) => Promise<T>,
  options: { json?: boolean } = {}
): Promise<T> {
  let runtime: Web3AgentRuntime;

  try {
    runtime = await createCliRuntime();
  } catch (e: unknown) {
    if (options.json) {
      throw new CliExitError("RUNTIME_SETUP_FAILED", e instanceof Error ? e.message : String(e));
    }

    throw e;
  }

  try {
    return await run(runtime);
  } finally {
    try {
      await runtime.shutdown();
    } catch (e: unknown) {
      process.stderr.write(
        `[web3agent] Runtime shutdown failed: ${e instanceof Error ? e.message : String(e)}\n`
      );
    }
  }
}
