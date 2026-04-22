import { getToolResultPayload } from "../../utils/tool-results.js";
import { failJson, writeJson } from "../output.js";
import { withCliRuntime } from "../runtime.js";

function printHelp(): void {
  process.stderr.write(
    `${[
      "web3agent tools — Tool discovery and invocation",
      "",
      "Usage:",
      "  web3agent tools list --json",
      "  web3agent tools describe <tool-name> --json",
      "  web3agent tools call <tool-name> --input '{...}' --json",
    ].join("\n")}\n`
  );
}

export async function runToolsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (subcommand === "list") {
    await withCliRuntime(async (runtime) => {
      writeJson({
        ok: true,
        data: {
          tools: runtime.listTools(),
        },
      });
    });
    return;
  }

  if (subcommand === "describe") {
    const toolName = rest.find((arg) => !arg.startsWith("--"));
    if (!toolName) {
      failJson("MISSING_TOOL_NAME", "Usage: web3agent tools describe <tool-name> --json");
    }

    await withCliRuntime(async (runtime) => {
      const tool = runtime.getTool(toolName);
      if (!tool) {
        failJson("UNKNOWN_TOOL", `Unknown tool: ${toolName}`);
      }

      writeJson({
        ok: true,
        data: {
          tool,
        },
      });
    });
    return;
  }

  if (subcommand === "call") {
    const toolName = rest.find((arg) => !arg.startsWith("--"));
    if (!toolName) {
      failJson(
        "MISSING_TOOL_NAME",
        "Usage: web3agent tools call <tool-name> --input '{...}' --json"
      );
    }

    const inputFlagIndex = rest.indexOf("--input");
    const inputJson = inputFlagIndex === -1 ? "{}" : rest[inputFlagIndex + 1];
    if (inputJson === undefined) {
      failJson("MISSING_INPUT", "--input requires a JSON object string");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson);
    } catch (error: unknown) {
      failJson(
        "INVALID_INPUT_JSON",
        error instanceof Error ? error.message : "Failed to parse --input JSON"
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      failJson("INVALID_INPUT", "--input must be a JSON object");
    }
    const input = parsed as Record<string, unknown>;

    await withCliRuntime(async (runtime) => {
      try {
        const result = await runtime.invokeTool(toolName, input);
        const payload = getToolResultPayload(result);
        if (payload.ok) {
          writeJson({ ok: true, data: payload.data });
        } else {
          writeJson(payload);
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        writeJson({
          ok: false,
          error: {
            code: "TOOL_INVOCATION_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });
    return;
  }

  printHelp();
}
