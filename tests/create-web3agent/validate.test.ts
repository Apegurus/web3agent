import { describe, expect, it } from "vitest";
import { assertSupportedNodeVersion, buildPostinstallPlan } from "../../src/create/validate.js";

describe("create-web3agent validate", () => {
  it("accepts Node.js 22 or newer", () => {
    expect(() => assertSupportedNodeVersion("v22.3.0")).not.toThrow();
    expect(() => assertSupportedNodeVersion("v23.0.0")).not.toThrow();
  });

  it("rejects Node.js versions below 22", () => {
    expect(() => assertSupportedNodeVersion("v20.18.0")).toThrow("Node.js 22 or newer is required");
  });

  it("builds a post-install plan with install and check commands", () => {
    expect(
      buildPostinstallPlan({
        projectDir: "my-agent",
        packageManager: "npm",
        skipInstall: false,
        skipChecks: false,
      })
    ).toEqual({
      commands: ["npm install", "npm run check"],
      nextSteps: ["cd my-agent", "npm install", "npm run check", "npm run dev"],
    });
  });

  it("omits skipped post-install commands", () => {
    expect(
      buildPostinstallPlan({
        projectDir: "my-agent",
        packageManager: "npm",
        skipInstall: true,
        skipChecks: true,
      })
    ).toEqual({
      commands: [],
      nextSteps: ["cd my-agent", "npm run dev"],
    });
  });
});
