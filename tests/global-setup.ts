import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPackWorkDir, withPackLock } from "./e2e/pack-mutex.js";

const ROOT = process.cwd();

function gitOutput(command: string): string {
  return execSync(command, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
}

function buildStateKey(): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(join(ROOT, "package.json"), "utf-8"));
  hash.update(readFileSync(join(ROOT, "packages", "create-web3agent", "package.json"), "utf-8"));
  hash.update(gitOutput("git rev-parse HEAD"));
  hash.update(gitOutput("git diff --binary"));
  return hash.digest("hex").slice(0, 16);
}

function buildOutputsExist(): boolean {
  return (
    existsSync(join(ROOT, "dist", "cli.js")) &&
    existsSync(join(ROOT, "dist", "index.js")) &&
    existsSync(join(ROOT, "packages", "create-web3agent", "dist", "index.js"))
  );
}

// Both `pnpm build` and `pnpm pack` (whose prepack hook re-runs the build)
// invoke tsup with `clean: true`, which deletes `dist/` before recompiling.
// Two parallel callers — even one build + one pack — race on that directory
// and produce ENOENT. The pack-mutex serializes both operations on the same
// lock since they share the dist/ contention domain.
export function ensureBuild(): void {
  withPackLock(() => {
    const stampPath = join(getPackWorkDir(), `build-${buildStateKey()}.stamp`);
    if (existsSync(stampPath) && buildOutputsExist()) return;
    execSync("pnpm build", {
      cwd: ROOT,
      stdio: "inherit",
    });
    writeFileSync(stampPath, `${new Date().toISOString()}\n`, "utf-8");
  });
}
