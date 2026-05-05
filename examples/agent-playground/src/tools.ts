import { type ToolSet, jsonSchema, tool } from "ai";
import { createRuntime } from "web3agent/runtime";
import type { CallToolResult } from "web3agent/runtime";

function normalizeResult(result: CallToolResult): unknown {
  const first = result.content?.[0];
  const text = first && "text" in first ? first.text : undefined;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch (_e: unknown) {
    // text is not JSON — return as plain string (e.g. error messages)
    return text;
  }
}

export async function loadWeb3Tools() {
  const runtime = await createRuntime();
  const catalog = runtime.listTools();

  const tools: ToolSet = {};

  for (const entry of catalog) {
    tools[entry.name] = tool({
      description: entry.description ?? entry.name,
      // biome-ignore lint/suspicious/noExplicitAny: AI SDK jsonSchema accepts any JSON Schema object
      parameters: jsonSchema(entry.inputSchema as any),
      execute: async (params) => {
        const result = await runtime.invokeTool(entry.name, params as Record<string, unknown>);
        return normalizeResult(result);
      },
    });
  }

  process.stderr.write(
    `[playground] Loaded ${Object.keys(tools).length} tools from web3agent runtime\n`
  );

  return { tools, runtime };
}
