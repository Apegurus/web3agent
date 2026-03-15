import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(" ")}`, result.stdout.trim(), result.stderr.trim()]
        .filter(Boolean)
        .join("\n")
    );
  }

  return `${result.stdout}${result.stderr}`.trim();
}

const tarballPath = process.argv[2];
if (!tarballPath) {
  throw new Error("Usage: node tests/e2e/package-install-smoke.mjs <path-to-tarball>");
}

const installRoot = mkdtempSync(join(tmpdir(), "web3agent-install-smoke-"));
const npmCache = join(installRoot, ".npm-cache");

try {
  writeFileSync(
    join(installRoot, "package.json"),
    JSON.stringify(
      {
        name: "web3agent-install-smoke",
        private: true,
        type: "module",
      },
      null,
      2
    )
  );

  run("npm", ["install", resolve(tarballPath)], installRoot, {
    npm_config_cache: npmCache,
  });

  const installedPackage = JSON.parse(
    readFileSync(join(installRoot, "node_modules", "web3agent", "package.json"), "utf-8")
  );
  const versionOutput = run("node", ["node_modules/.bin/web3agent", "--version"], installRoot);
  if (!versionOutput.includes(`web3agent ${installedPackage.version}`)) {
    throw new Error(`Unexpected version output: ${versionOutput}`);
  }

  const helpOutput = run("node", ["node_modules/.bin/web3agent", "--help"], installRoot);
  if (!helpOutput.includes("Usage:")) {
    throw new Error(`Unexpected help output: ${helpOutput}`);
  }

  const importOutput = run(
    "node",
    [
      "--input-type=module",
      "-e",
      "const mod = await import('web3agent'); console.log([typeof mod.parseEnv, typeof mod.setConfig, typeof mod.pollSwapStatus].join(' '));",
    ],
    installRoot
  );

  if (!importOutput.startsWith("function function function")) {
    throw new Error(`Unexpected root export output: ${importOutput}`);
  }
} finally {
  rmSync(installRoot, { recursive: true, force: true });
}
