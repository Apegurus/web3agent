import { createRuntime } from "./managed-runtime.js";
import type { Web3AgentRuntime } from "./types.js";

let defaultRuntimePromise: Promise<Web3AgentRuntime> | undefined;

export function getDefaultRuntime(): Promise<Web3AgentRuntime> {
  if (!defaultRuntimePromise) {
    defaultRuntimePromise = createRuntime();
  }
  return defaultRuntimePromise;
}

export async function shutdownDefaultRuntime(): Promise<void> {
  if (!defaultRuntimePromise) {
    return;
  }

  const runtimePromise = defaultRuntimePromise;
  defaultRuntimePromise = undefined;
  const runtime = await runtimePromise;
  await runtime.shutdown();
}

export function resetDefaultRuntimeForTests(): void {
  defaultRuntimePromise = undefined;
}
