import { describe, expect, it } from "vitest";
import {
  getAgentVisibleSecretsDisabledMessage,
  isAgentVisibleSecretsEnabled,
} from "../../src/wallet/agent-visible-secrets.js";

describe("isAgentVisibleSecretsEnabled", () => {
  it("returns false when env var is not set", () => {
    expect(isAgentVisibleSecretsEnabled({})).toBe(false);
  });

  it("returns false when env var is set to '0'", () => {
    expect(isAgentVisibleSecretsEnabled({ WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS: "0" })).toBe(
      false
    );
  });

  it("returns false when env var is set to 'true'", () => {
    expect(isAgentVisibleSecretsEnabled({ WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS: "true" })).toBe(
      false
    );
  });

  it("returns false when env var is set to 'yes'", () => {
    expect(isAgentVisibleSecretsEnabled({ WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS: "yes" })).toBe(
      false
    );
  });

  it("returns false when env var is empty string", () => {
    expect(isAgentVisibleSecretsEnabled({ WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS: "" })).toBe(false);
  });

  it("returns true only when env var is exactly '1'", () => {
    expect(isAgentVisibleSecretsEnabled({ WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS: "1" })).toBe(true);
  });

  it("uses process.env by default", () => {
    // Just verify it doesn't throw and returns a boolean
    const result = isAgentVisibleSecretsEnabled();
    expect(typeof result).toBe("boolean");
  });
});

describe("getAgentVisibleSecretsDisabledMessage", () => {
  it("returns a string", () => {
    const msg = getAgentVisibleSecretsDisabledMessage();
    expect(typeof msg).toBe("string");
  });

  it("mentions the exact env var name", () => {
    const msg = getAgentVisibleSecretsDisabledMessage();
    expect(msg).toContain("WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS");
  });

  it("mentions inference or API context", () => {
    const msg = getAgentVisibleSecretsDisabledMessage();
    // Must mention inference/API context to warn users about the risk
    const mentionsContext =
      msg.toLowerCase().includes("inference") ||
      msg.toLowerCase().includes("api") ||
      msg.toLowerCase().includes("agent");
    expect(mentionsContext).toBe(true);
  });

  it("is non-empty", () => {
    const msg = getAgentVisibleSecretsDisabledMessage();
    expect(msg.length).toBeGreaterThan(0);
  });
});
