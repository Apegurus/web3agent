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
});
