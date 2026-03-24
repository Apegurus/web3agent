import { VERSION } from "./version.js";

async function runCli(args: string[]): Promise<void> {
  if (args[0] === "init") {
    const { runInit } = await import("./cli/init.js");
    await runInit(args.slice(1));
    return;
  }

  if (args[0] === "policy") {
    const { runPolicy } = await import("./cli/policy.js");
    await runPolicy(args.slice(1));
    return;
  }

  if (args[0] === "tools") {
    const { runToolsCommand } = await import("./cli/commands/tools.js");
    await runToolsCommand(args.slice(1));
    return;
  }

  if (args[0] === "tool") {
    const { runToolsCommand } = await import("./cli/commands/tools.js");
    await runToolsCommand(args.slice(1));
    return;
  }

  if (args[0] === "doctor") {
    const { runDoctorCommand } = await import("./cli/commands/doctor.js");
    await runDoctorCommand(args.slice(1));
    return;
  }

  if (args.includes("--version")) {
    process.stderr.write(`web3agent ${VERSION}\n`);
    process.exit(0);
  }

  if (args.includes("--help")) {
    process.stderr.write(
      `${[
        "web3agent — Web3 MCP proxy server",
        "",
        "Usage:",
        "  web3agent               Start MCP proxy server (stdio)",
        "  web3agent init          Configure your AI agent host",
        "  web3agent policy        Show or update treasury spending limits",
        "  web3agent tools         List or describe tools",
        "  web3agent tool call     Invoke a tool with JSON input",
        "  web3agent doctor        Show runtime health diagnostics",
        "",
        "Options:",
        "  --version        Print version",
        "  --help           Print this help",
      ].join("\n")}\n`
    );
    process.exit(0);
  }

  const { startServer } = await import("./runtime/startup.js");
  await startServer();
}

void runCli(process.argv.slice(2)).catch((e: unknown) => {
  const prefix = process.argv.slice(2).length > 0 ? "Error" : "Fatal";
  process.stderr.write(`${prefix}: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

export { runCli };
