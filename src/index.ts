const args = process.argv.slice(2);

if (args[0] === "init") {
  import("./cli/init.js").then(({ runInit }) => {
    runInit(args.slice(1)).catch((e: Error) => {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(1);
    });
  });
} else if (args.includes("--version")) {
  process.stderr.write("web3agent 0.1.0\n");
  process.exit(0);
} else if (args.includes("--help")) {
  process.stderr.write(
    `${[
      "web3agent — Web3 MCP proxy server",
      "",
      "Usage:",
      "  web3agent        Start MCP proxy server (stdio)",
      "  web3agent init   Configure your AI agent host",
      "",
      "Options:",
      "  --version        Print version",
      "  --help           Print this help",
    ].join("\n")}\n`
  );
  process.exit(0);
} else {
  import("./runtime/startup.js").then(({ startServer }) => {
    startServer().catch((e: Error) => {
      process.stderr.write(`Fatal: ${e.message}\n`);
      process.exit(1);
    });
  });
}
