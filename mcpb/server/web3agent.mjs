import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npmPrefix = join(tmpdir(), "web3agent-mcpb-npm");
mkdirSync(npmPrefix, { recursive: true });

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  command,
  [
    "exec",
    "--yes",
    "--prefix",
    npmPrefix,
    "--package",
    "web3agent@0.6.2",
    "--",
    "web3agent",
    ...process.argv.slice(2),
  ],
  {
    env: process.env,
    stdio: "inherit",
  }
);

child.on("error", (error) => {
  process.stderr.write(`[web3agent-mcpb] failed to launch web3agent via npx: ${error.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
