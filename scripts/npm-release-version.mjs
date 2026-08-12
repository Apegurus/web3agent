import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

export function deriveNpmRelease({ baseVersion, ref, sha }) {
  if (!STABLE_VERSION.test(baseVersion)) {
    throw new Error(`Committed package version must be stable SemVer, received: ${baseVersion}`);
  }
  if (!COMMIT_SHA.test(sha)) {
    throw new Error(`Git commit must be a full lowercase SHA-1, received: ${sha}`);
  }

  if (ref === "refs/heads/main") {
    return { distTag: "latest", releaseVersion: baseVersion };
  }
  if (ref === "refs/heads/develop") {
    return {
      distTag: "develop",
      releaseVersion: `${baseVersion}-develop.sha${sha}`,
    };
  }

  throw new Error(`Unsupported publishing ref: ${ref}`);
}

export function applyNpmRelease({ outputPath, ref, rootPath, sha }) {
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required");
  }

  const packagePath = join(rootPath, "package.json");
  const serverPath = join(rootPath, "server.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.name !== "web3agent") {
    throw new Error(`Publishing is restricted to web3agent, received: ${packageJson.name}`);
  }
  const release = deriveNpmRelease({
    baseVersion: packageJson.version,
    ref,
    sha,
  });

  const serverJson = JSON.parse(readFileSync(serverPath, "utf8"));
  if (serverJson.version !== packageJson.version) {
    throw new Error("server.json version must match package.json before release derivation");
  }
  const npmPackage = serverJson.packages?.find(({ identifier }) => identifier === "web3agent");
  if (!npmPackage || npmPackage.version !== packageJson.version) {
    throw new Error("server.json npm package version must match package.json");
  }

  packageJson.version = release.releaseVersion;
  serverJson.version = release.releaseVersion;
  npmPackage.version = release.releaseVersion;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(serverPath, `${JSON.stringify(serverJson, null, 2)}\n`);

  appendFileSync(outputPath, `release_version=${release.releaseVersion}\n`);
  appendFileSync(outputPath, `dist_tag=${release.distTag}\n`);
}

function prepareRelease() {
  applyNpmRelease({
    outputPath: process.env.GITHUB_OUTPUT ?? "",
    ref: process.env.GITHUB_REF ?? "",
    rootPath: fileURLToPath(new URL("..", import.meta.url)),
    sha: process.env.GITHUB_SHA ?? "",
  });
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  prepareRelease();
}
