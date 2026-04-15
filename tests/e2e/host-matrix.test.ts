import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureBuild } from "../global-setup.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/hosts");
const DIST_INDEX = join(process.cwd(), "dist/cli.js");

const HOSTS = ["claude", "cursor", "windsurf", "opencode", "codex"] as const;
const MODES = ["proxy", "multi-server"] as const;

describe("host matrix tests", () => {
  beforeAll(() => ensureBuild(), 120_000);

  for (const host of HOSTS) {
    for (const mode of MODES) {
      it(`configures ${host} in ${mode} mode`, () => {
        const tmpDir = join(tmpdir(), `web3agent-test-${host}-${mode}-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });

        try {
          const fixtureDir = join(FIXTURES, `${host}-project`);
          cpSync(fixtureDir, tmpDir, { recursive: true });

          const result = execSync(
            `node ${DIST_INDEX} init --host ${host} --mode ${mode} --project ${tmpDir} --dry-run`,
            { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          );

          expect(result).toBe("");
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });
    }
  }

  it("exits non-zero for multi-host fixture without --host flag", () => {
    const tmpDir = join(tmpdir(), `web3agent-test-multi-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const fixtureDir = join(FIXTURES, "multi-host-project");
      cpSync(fixtureDir, tmpDir, { recursive: true });

      let exitCode = 0;
      let stderr = "";
      try {
        execSync(`node ${DIST_INDEX} init --project ${tmpDir} --dry-run`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error: unknown) {
        exitCode = (error as { status?: number }).status ?? 1;
        stderr = (error as { stderr?: string }).stderr ?? "";
      }

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Multiple agent hosts detected");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
