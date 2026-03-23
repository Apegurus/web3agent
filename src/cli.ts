import { VERSION } from "./version.js";

const args = process.argv.slice(2);

if (args[0] === "init") {
  import("./cli/init.js").then(({ runInit }) => {
    runInit(args.slice(1)).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  });
} else if (args[0] === "policy") {
  import("./cli/policy.js").then(({ runPolicy }) => {
    runPolicy(args.slice(1)).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  });
} else if (args.includes("--version")) {
  process.stderr.write(`web3agent ${VERSION}\n`);
  process.exit(0);
} else if (args.includes("--help")) {
  process.stderr.write(
    `${[
      "web3agent — Web3 MCP proxy server",
      "",
      "Usage:",
      "  web3agent               Start MCP proxy server (stdio)",
      "  web3agent init          Configure your AI agent host",
      "  web3agent policy        Show or update treasury spending limits",
      "",
      "Options:",
      "  --version        Print version",
      "  --help           Print this help",
    ].join("\n")}\n`
  );
  process.exit(0);
} else {
  import("./runtime/startup.js").then(({ startServer }) => {
    startServer().catch((e: unknown) => {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  });
}
