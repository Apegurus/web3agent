import { type ToolSet, jsonSchema, tool } from "ai";
import { createRuntime } from "web3agent/runtime";
import type { CallToolResult } from "web3agent/runtime";

function normalizeResult(result: CallToolResult): unknown {
  const first = result.content?.[0];
  const text = first && "text" in first ? first.text : undefined;
  if (!text) {
    return result;
  }

  try {
    return JSON.parse(text);
  } catch (_error: unknown) {
    return text;
  }
}

export async function loadWeb3Tools() {
  const runtime = await createRuntime();
  const tools: ToolSet = {};

  for (const entry of runtime.listTools()) {
    tools[entry.name] = tool({
      description: entry.description ?? entry.name,
      // biome-ignore lint/suspicious/noExplicitAny: AI SDK jsonSchema accepts arbitrary JSON Schema.
      parameters: jsonSchema(entry.inputSchema as any),
      execute: async (params) => {
        const result = await runtime.invokeTool(entry.name, params as Record<string, unknown>);
        return normalizeResult(result);
      },
    });
  }

  return { runtime, tools };
}
