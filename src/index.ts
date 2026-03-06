// Main entry point — routes between init subcommand and server mode
// Full implementation in Task 10

const args = process.argv.slice(2);

if (args[0] === "init") {
  // TODO: Task 3 — host detection, config writing, context installation
  process.stderr.write("web3agent init — coming soon\n");
  process.exit(0);
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
  // Server mode — TODO: Task 10 — proxy runtime assembly
  process.stderr.write("web3agent: starting MCP proxy server (stub)\n");
  // Hold process open for now
}
