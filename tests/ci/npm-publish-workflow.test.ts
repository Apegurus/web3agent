import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const packageStart = workflow.indexOf("  package_npm:");
const publishStart = workflow.indexOf("  publish_npm:");
const packageJob = workflow.slice(packageStart, publishStart);
const publishJob = workflow.slice(publishStart);

describe("npm publishing workflow", () => {
  it("Given a branch run When packaging Then the complete CI matrix and merged PR are required", () => {
    expect(packageStart).toBeGreaterThan(0);
    expect(packageJob).toContain("needs: ci");
    expect(packageJob).toContain("github.event_name == 'push'");
    expect(packageJob).toContain("commits/${GITHUB_SHA}/pulls");
    expect(packageJob).toContain("node scripts/npm-release-version.mjs");
  });

  it("Given the publish job When requesting npm access Then OIDC is isolated to the exact tarball", () => {
    expect(publishStart).toBeGreaterThan(packageStart);
    expect(packageJob).not.toContain("id-token: write");
    expect(publishJob).toContain("needs: package_npm");
    expect(publishJob).toContain("environment: npm-publish");
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).toContain('npm publish ".release/${TARBALL}"');
    expect(workflow).not.toContain("secrets.NPM_TOKEN");
  });
});
