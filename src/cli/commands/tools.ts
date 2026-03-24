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

  printHelp();
}
