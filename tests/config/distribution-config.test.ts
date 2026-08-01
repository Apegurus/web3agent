import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("distribution configuration", () => {
  it("Given every installer manifest, when resume authentication is configured, then each exposes the secret ring", () => {
    const mcpbManifest = readFileSync(join(root, "mcpb/manifest.json"), "utf8");
    const registryManifest = readFileSync(join(root, "server.json"), "utf8");
    const smitheryManifest = readFileSync(join(root, "smithery.yaml"), "utf8");

    expect(mcpbManifest).toContain(
      '"WEB3AGENT_RESUME_STATE_SECRETS": "${user_config.resume_state_secrets}"'
    );
    expect(mcpbManifest).toContain('"resume_state_secrets": {');
    expect(registryManifest).toContain('"name": "WEB3AGENT_RESUME_STATE_SECRETS"');
    expect(smitheryManifest).toContain("WEB3AGENT_RESUME_STATE_SECRETS: config.resumeStateSecrets");
    expect(smitheryManifest).toContain("resumeStateSecrets:");
  });

  it("keeps the release version aligned across every executable distribution surface", () => {
    const packageManifest = readFileSync(join(root, "package.json"), "utf8");
    const mcpbManifest = readFileSync(join(root, "mcpb/manifest.json"), "utf8");
    const registryManifest = readFileSync(join(root, "server.json"), "utf8");
    const launcher = readFileSync(join(root, "mcpb/server/web3agent.mjs"), "utf8");

    expect(packageManifest).toContain('"version": "0.7.0"');
    expect(mcpbManifest).toContain('"version": "0.7.0"');
    expect(registryManifest).toContain('"version": "0.7.0"');
    expect(launcher).toContain('"web3agent@0.7.0"');
  });

  it("documents the 0x key in every generated starter environment", () => {
    for (const template of ["mastra", "mcp-host", "vercel-ai-sdk"]) {
      const environment = readFileSync(
        join(root, "templates/create", template, ".env.example"),
        "utf8"
      );
      expect(environment).toContain("ZEROX_API_KEY=");
    }
  });
});
