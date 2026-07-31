import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      WEB3AGENT_RESUME_STATE_SECRETS: "web3agent-vitest-resume-state-secret-v1",
    },
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
    },
  },
});
