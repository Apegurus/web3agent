import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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

function prepareRelease() {
  const packagePath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.name !== "web3agent") {
    throw new Error(`Publishing is restricted to web3agent, received: ${packageJson.name}`);
  }

  const release = deriveNpmRelease({
    baseVersion: packageJson.version,
    ref: process.env.GITHUB_REF ?? "",
    sha: process.env.GITHUB_SHA ?? "",
  });
  packageJson.version = release.releaseVersion;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  appendFileSync(outputPath, `release_version=${release.releaseVersion}\n`);
  appendFileSync(outputPath, `dist_tag=${release.distTag}\n`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  prepareRelease();
}
