import { describe, expect, it } from "vitest";
import { deriveNpmRelease } from "../../scripts/npm-release-version.mjs";

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
});
