import { describe, expect, it } from "vitest";
import { runPostinstallCommands } from "../../src/create/postinstall.js";

describe("create-web3agent postinstall", () => {
  it("runs planned commands in order inside the generated project", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

    await runPostinstallCommands(
      {
        projectDir: "/tmp/my-agent",
        commands: [
          { command: "npm", args: ["install"], cwd: "" },
          { command: "npm", args: ["run", "check"], cwd: "" },
        ],
      },
      async ({ command, args, cwd }) => {
        calls.push({ command, args, cwd });
      }
    );

    expect(calls).toEqual([
      { command: "npm", args: ["install"], cwd: "/tmp/my-agent" },
      { command: "npm", args: ["run", "check"], cwd: "/tmp/my-agent" },
    ]);
  });

  it("preserves an explicit command cwd", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

    await runPostinstallCommands(
      {
        projectDir: "/tmp/my-agent",
        commands: [
          { command: "npm", args: ["install"], cwd: "/tmp/shared-cache" },
          { command: "npm", args: ["run", "check"], cwd: "" },
        ],
      },
      async ({ command, args, cwd }) => {
        calls.push({ command, args, cwd });
      }
    );

    expect(calls).toEqual([
      { command: "npm", args: ["install"], cwd: "/tmp/shared-cache" },
      { command: "npm", args: ["run", "check"], cwd: "/tmp/my-agent" },
    ]);
  });

  it("does nothing when the plan has no commands", async () => {
    const calls: string[] = [];

    await runPostinstallCommands(
      {
        projectDir: "/tmp/my-agent",
        commands: [],
      },
      async ({ command }) => {
        calls.push(command);
      }
    );

    expect(calls).toEqual([]);
  });
});
