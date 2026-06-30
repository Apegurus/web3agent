import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureBuild } from "../global-setup.js";
import { getPackWorkDir, withPackLock } from "./pack-mutex.js";

const ROOT = process.cwd();

interface PackageJson {
  readonly version: string;
}

export interface PackedTarballs {
  readonly rootTarball: string;
  readonly createTarball: string;
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
}

function gitOutput(command: string): string {
  return execSync(command, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
}

function packageStateKey(rootVersion: string, createVersion: string): string {
  const hash = createHash("sha256");
  hash.update(rootVersion);
  hash.update(createVersion);
  hash.update(gitOutput("git rev-parse HEAD"));
  hash.update(gitOutput("git diff --binary"));
  return hash.digest("hex").slice(0, 16);
}

export function ensurePackedTarballs(): PackedTarballs {
  const rootPackage = readPackageJson(join(ROOT, "package.json"));
  const createPackage = readPackageJson(join(ROOT, "packages", "create-web3agent", "package.json"));
  const packRoot = join(
    getPackWorkDir(),
    `packs-${packageStateKey(rootPackage.version, createPackage.version)}`
  );
  const rootTarball = join(packRoot, `web3agent-${rootPackage.version}.tgz`);
  const createTarball = join(packRoot, `create-web3agent-${createPackage.version}.tgz`);

  ensureBuild();
  withPackLock(() => {
    mkdirSync(packRoot, { recursive: true });
    if (!existsSync(rootTarball)) {
      execSync(`pnpm pack --pack-destination ${packRoot}`, { cwd: ROOT, stdio: "inherit" });
    }
    if (!existsSync(createTarball)) {
      execSync(`pnpm pack --pack-destination ${packRoot}`, {
        cwd: join(ROOT, "packages", "create-web3agent"),
        stdio: "inherit",
      });
    }
  });

  return { rootTarball, createTarball };
}
