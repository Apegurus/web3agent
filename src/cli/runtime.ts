import { createRuntime } from "../runtime/managed-runtime.js";
import type { Web3AgentRuntime } from "../runtime/types.js";

export async function createCliRuntime(): Promise<Web3AgentRuntime> {
  return createRuntime();
}

export async function withCliRuntime<T>(
  run: (runtime: Web3AgentRuntime) => Promise<T>
): Promise<T> {
  const runtime = await createCliRuntime();
  try {
    return await run(runtime);
  } finally {
    await runtime.shutdown();
  }
}
