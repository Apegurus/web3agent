import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const eligibilityStart = workflow.indexOf("  release_eligibility:");
const packageStart = workflow.indexOf("  package_npm:");
const publishStart = workflow.indexOf("  publish_npm:");
const eligibilityJob = workflow.slice(eligibilityStart, packageStart);
const packageJob = workflow.slice(packageStart, publishStart);
const publishJob = workflow.slice(publishStart);

describe("npm publishing workflow", () => {
  it("Given a branch run When packaging Then the complete CI matrix and merged PR are required", () => {
    expect(eligibilityStart).toBeGreaterThan(0);
    expect(packageStart).toBeGreaterThan(0);
    expect(eligibilityJob).toContain("needs: ci");
    expect(eligibilityJob).toContain("github.event_name == 'push'");
    expect(eligibilityJob).toContain("commits/${GITHUB_SHA}/pulls");
    expect(eligibilityJob).toContain('.merge_commit_sha == \\"${GITHUB_SHA}\\"');
    expect(packageJob).toContain("needs: release_eligibility");
    expect(packageJob).toContain("outputs.eligible == 'true'");
    expect(packageJob).toContain("node scripts/npm-release-version.mjs");
    expect(packageJob).toContain("pnpm install --frozen-lockfile --ignore-scripts");
    expect(packageJob).not.toContain("cache: 'pnpm'");
  });

  it("Given the publish job When requesting npm access Then OIDC is isolated to the exact tarball", () => {
    expect(publishStart).toBeGreaterThan(packageStart);
    expect(packageJob).not.toContain("id-token: write");
    expect(publishJob).toContain("needs: package_npm");
    expect(publishJob).toContain("environment: npm-publish");
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).toContain('npm publish ".release/${TARBALL}"');
    expect(publishJob).toContain("dist.integrity");
    expect(publishJob).toContain("dist.attestations.url");
    expect(workflow).not.toContain("secrets.NPM_TOKEN");
    expect(workflow).not.toMatch(/uses: (actions|pnpm)\/[\w-]+@v\d/);
  });
});
