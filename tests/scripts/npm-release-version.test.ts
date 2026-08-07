import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyNpmRelease, deriveNpmRelease } from "../../scripts/npm-release-version.mjs";

const SHA = "253e28a8ad122e077fa0e25de0557af1630963d5";

describe("npm release version derivation", () => {
  it("Given main When deriving a release Then it keeps the committed version on latest", () => {
    expect(deriveNpmRelease({ baseVersion: "0.7.0", ref: "refs/heads/main", sha: SHA })).toEqual({
      distTag: "latest",
      releaseVersion: "0.7.0",
    });
  });

  it("Given develop When deriving a release Then it includes the full commit hash", () => {
    expect(deriveNpmRelease({ baseVersion: "0.7.0", ref: "refs/heads/develop", sha: SHA })).toEqual(
      {
        distTag: "develop",
        releaseVersion: `0.7.0-develop.sha${SHA}`,
      }
    );
  });

  it.each([
    { baseVersion: "0.7.0-rc.1", ref: "refs/heads/main", sha: SHA },
    { baseVersion: "0.7", ref: "refs/heads/main", sha: SHA },
    { baseVersion: "0.7.0", ref: "refs/heads/feature", sha: SHA },
    { baseVersion: "0.7.0", ref: "refs/heads/develop", sha: "253e28a" },
  ])("Given invalid release input When deriving Then it fails closed", (input) => {
    expect(() => deriveNpmRelease(input)).toThrow();
  });

  it("Given a develop checkout When preparing Then package and server metadata match", () => {
    const rootPath = mkdtempSync(join(tmpdir(), "web3agent-npm-release-"));
    const outputPath = join(rootPath, "github-output");
    writeFileSync(
      join(rootPath, "package.json"),
      `${JSON.stringify({ name: "web3agent", version: "0.7.0" }, null, 2)}\n`
    );
    writeFileSync(
      join(rootPath, "server.json"),
      `${JSON.stringify(
        {
          name: "io.github.Apegurus/web3agent",
          version: "0.7.0",
          packages: [{ identifier: "web3agent", version: "0.7.0" }],
        },
        null,
        2
      )}\n`
    );

    applyNpmRelease({ outputPath, ref: "refs/heads/develop", rootPath, sha: SHA });

    const expectedVersion = `0.7.0-develop.sha${SHA}`;
    expect(JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"))).toMatchObject({
      version: expectedVersion,
    });
    expect(JSON.parse(readFileSync(join(rootPath, "server.json"), "utf8"))).toMatchObject({
      packages: [{ identifier: "web3agent", version: expectedVersion }],
      version: expectedVersion,
    });
    expect(readFileSync(outputPath, "utf8")).toBe(
      `release_version=${expectedVersion}\ndist_tag=develop\n`
    );
  });
});
