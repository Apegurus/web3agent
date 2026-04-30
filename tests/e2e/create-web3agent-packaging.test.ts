import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("create-web3agent packaging readiness", () => {
  it("pins the compatibility wrapper to the exact root package version", () => {
    const rootPackageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
      version: string;
    };
    const wrapperPackageJson = JSON.parse(
      readFileSync(join(ROOT, "packages", "create-web3agent", "package.json"), "utf-8")
    ) as {
      dependencies?: Record<string, string>;
    };

    const dep = wrapperPackageJson.dependencies?.web3agent;
    const isWorkspaceLink = dep === "workspace:*" || dep === "workspace:^";
    const isExactPin = dep === rootPackageJson.version;
    expect(isWorkspaceLink || isExactPin).toBe(true);
  });

  it("ships starter templates from the root package", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
      files?: string[];
    };

    expect(packageJson.files).toContain("templates/create");
    expect(packageJson.files).not.toContain("packages/create-web3agent/templates");
  });

  it("marks the create package as publishable", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "packages", "create-web3agent", "package.json"), "utf-8")
    ) as {
      name: string;
      private?: boolean;
      bin?: Record<string, string>;
    };

    expect(packageJson.name).toBe("create-web3agent");
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.bin?.["create-web3agent"]).toBe("dist/index.js");
  });

  it("declares the build tools used by its own package scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "packages", "create-web3agent", "package.json"), "utf-8")
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toContain("tsup");
    expect(packageJson.scripts?.typecheck).toContain("tsc");
    expect(packageJson.devDependencies?.tsup).toBeTruthy();
    expect(packageJson.devDependencies?.typescript).toBeTruthy();
  });

  it("documents npm create web3agent as the starter path", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf-8");

    expect(readme).toContain("npx web3agent create");
    expect(readme).toContain("npm create web3agent");
    expect(readme).toContain("Vercel AI SDK");
    expect(readme).toContain("Mastra");
    expect(readme).toContain("MCP-host");
  });
});
