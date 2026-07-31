import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, link, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperationResumeState } from "../../../src/api/types.js";

const OLD_SECRET = "old-web3agent-resume-state-secret-0001";
const NEW_SECRET = "new-web3agent-resume-state-secret-0002";

function resumeState(): OperationResumeState {
  return {
    integration: "lifi",
    kind: "swap",
    state: { operation: { account: "0x1111111111111111111111111111111111111111" } },
    version: 1,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resume-state integrity", () => {
  it("Given an authenticated envelope, when dispatch fields change, then verification fails", async () => {
    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", OLD_SECRET);
    vi.resetModules();
    const { assertResumeStateIntegrity, authenticateResumeState } = await import(
      "../../../src/api/operations/resume-state-integrity.js"
    );
    const authenticated = authenticateResumeState(resumeState());

    expect(() => assertResumeStateIntegrity(authenticated)).not.toThrow();
    expect(() => assertResumeStateIntegrity({ ...authenticated, kind: "bridge" })).toThrowError(
      expect.objectContaining({ code: "INVALID_PARAMS" })
    );
    expect(() =>
      assertResumeStateIntegrity({ ...authenticated, integration: "zeroex" })
    ).toThrowError(expect.objectContaining({ code: "INVALID_PARAMS" }));
  });

  it("Given rotated configured secrets, when an old state resumes, then the previous key still verifies", async () => {
    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", OLD_SECRET);
    vi.resetModules();
    const oldModule = await import("../../../src/api/operations/resume-state-integrity.js");
    const oldState = oldModule.authenticateResumeState(resumeState());

    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", `${NEW_SECRET},${OLD_SECRET}`);
    vi.resetModules();
    const rotatedModule = await import("../../../src/api/operations/resume-state-integrity.js");
    const newState = rotatedModule.authenticateResumeState(resumeState());

    expect(() => rotatedModule.assertResumeStateIntegrity(oldState)).not.toThrow();
    expect(newState.state.integrity).not.toBe(oldState.state.integrity);
  });

  it("Given no configured secret, when the module reloads, then the persisted host key verifies prior state", async () => {
    const home = await mkdtemp(join(tmpdir(), "web3agent-resume-key-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
    try {
      vi.resetModules();
      const firstModule = await import("../../../src/api/operations/resume-state-integrity.js");
      const authenticated = firstModule.authenticateResumeState(resumeState());

      vi.resetModules();
      const reloadedModule = await import("../../../src/api/operations/resume-state-integrity.js");

      expect(() => reloadedModule.assertResumeStateIntegrity(authenticated)).not.toThrow();
      if (process.platform !== "win32") {
        expect((await stat(join(home, ".web3agent", "resume-state.key"))).mode & 0o777).toBe(0o600);
      }
    } finally {
      await rm(home, { force: true, recursive: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "Given a symlinked fallback key, when authentication starts, then it rejects attacker-controlled key material",
    async () => {
      const home = await mkdtemp(join(tmpdir(), "web3agent-resume-symlink-"));
      vi.stubEnv("HOME", home);
      vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
      try {
        const directory = join(home, ".web3agent");
        const attackerKey = join(home, "attacker.key");
        await mkdir(directory, { mode: 0o700 });
        await writeFile(attackerKey, Buffer.alloc(32, 7), { mode: 0o600 });
        await symlink(attackerKey, join(directory, "resume-state.key"));
        vi.resetModules();
        const { authenticateResumeState } = await import(
          "../../../src/api/operations/resume-state-integrity.js"
        );

        expect(() => authenticateResumeState(resumeState())).toThrowError(
          expect.objectContaining({ code: "RESUME_STATE_KEY_UNAVAILABLE" })
        );
      } finally {
        await rm(home, { force: true, recursive: true });
      }
    }
  );

  it.runIf(process.platform !== "win32")(
    "Given a group-readable fallback key, when authentication starts, then it rejects insecure permissions",
    async () => {
      const home = await mkdtemp(join(tmpdir(), "web3agent-resume-mode-"));
      vi.stubEnv("HOME", home);
      vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
      try {
        const directory = join(home, ".web3agent");
        const keyPath = join(directory, "resume-state.key");
        await mkdir(directory, { mode: 0o700 });
        await writeFile(keyPath, Buffer.alloc(32, 9), { mode: 0o600 });
        await chmod(keyPath, 0o640);
        vi.resetModules();
        const { authenticateResumeState } = await import(
          "../../../src/api/operations/resume-state-integrity.js"
        );

        expect(() => authenticateResumeState(resumeState())).toThrowError(
          expect.objectContaining({ code: "RESUME_STATE_KEY_UNAVAILABLE" })
        );
      } finally {
        await rm(home, { force: true, recursive: true });
      }
    }
  );

  it.runIf(process.platform !== "win32")(
    "Given another process is publishing the fallback key, when authentication starts, then it waits for the secure final link",
    async () => {
      const home = await mkdtemp(join(tmpdir(), "web3agent-resume-race-"));
      vi.stubEnv("HOME", home);
      vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
      try {
        const directory = join(home, ".web3agent");
        const temporaryPath = join(directory, "publishing.tmp");
        const keyPath = join(directory, "resume-state.key");
        await mkdir(directory, { mode: 0o700 });
        await writeFile(temporaryPath, Buffer.alloc(32, 5), { mode: 0o600 });
        await link(temporaryPath, keyPath);
        const publisher = spawn(
          process.execPath,
          [
            "-e",
            'setTimeout(() => require("node:fs").unlinkSync(process.argv[1]), 25)',
            temporaryPath,
          ],
          { stdio: "ignore" }
        );
        vi.resetModules();
        const { authenticateResumeState } = await import(
          "../../../src/api/operations/resume-state-integrity.js"
        );

        expect(() => authenticateResumeState(resumeState())).not.toThrow();
        await once(publisher, "exit");
      } finally {
        await rm(home, { force: true, recursive: true });
      }
    }
  );

  it.runIf(process.platform !== "win32")(
    "Given a publisher died after linking the fallback key, when authentication starts, then it recovers the secure key",
    async () => {
      const home = await mkdtemp(join(tmpdir(), "web3agent-resume-orphan-"));
      vi.stubEnv("HOME", home);
      vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
      try {
        const directory = join(home, ".web3agent");
        const keyPath = join(directory, "resume-state.key");
        const temporaryPath = `${keyPath}.999.deadbeef.tmp`;
        await mkdir(directory, { mode: 0o700 });
        await writeFile(temporaryPath, Buffer.alloc(32, 6), { mode: 0o600 });
        await link(temporaryPath, keyPath);
        vi.resetModules();
        const { authenticateResumeState } = await import(
          "../../../src/api/operations/resume-state-integrity.js"
        );

        expect(() => authenticateResumeState(resumeState())).not.toThrow();
        expect((await stat(keyPath)).nlink).toBe(1);
        await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await rm(home, { force: true, recursive: true });
      }
    }
  );

  it.runIf(process.platform !== "win32")(
    "Given scoped runtime config without resume secrets, when ambient secrets exist, then it uses the host key",
    async () => {
      const home = await mkdtemp(join(tmpdir(), "web3agent-resume-scope-"));
      vi.stubEnv("HOME", home);
      vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", OLD_SECRET);
      try {
        vi.resetModules();
        const [
          { assertResumeStateIntegrity, authenticateResumeState },
          { parseEnv, withConfigSync },
        ] = await Promise.all([
          import("../../../src/api/operations/resume-state-integrity.js"),
          import("../../../src/config/env.js"),
        ]);
        const ambientState = authenticateResumeState(resumeState());
        const scopedConfig = parseEnv({});

        const scopedState = withConfigSync(scopedConfig, () =>
          authenticateResumeState(resumeState())
        );

        expect(scopedState.state.integrity).not.toBe(ambientState.state.integrity);
        withConfigSync(scopedConfig, () => {
          expect(() => assertResumeStateIntegrity(scopedState)).not.toThrow();
          expect(() => assertResumeStateIntegrity(ambientState)).toThrowError(
            expect.objectContaining({ code: "INVALID_PARAMS" })
          );
        });
      } finally {
        await rm(home, { force: true, recursive: true });
      }
    }
  );

  it("Given Windows without configured secrets, when authentication starts, then it requires an explicit key ring", async () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", "");
    try {
      vi.resetModules();
      const { authenticateResumeState } = await import(
        "../../../src/api/operations/resume-state-integrity.js"
      );

      expect(() => authenticateResumeState(resumeState())).toThrowError(
        expect.objectContaining({ code: "RESUME_STATE_KEY_UNAVAILABLE" })
      );
    } finally {
      platform.mockRestore();
    }
  });

  it("Given mutable action results inside state, when they change, then the immutable envelope remains valid", async () => {
    vi.stubEnv("WEB3AGENT_RESUME_STATE_SECRETS", OLD_SECRET);
    vi.resetModules();
    const { assertResumeStateIntegrity, authenticateResumeState } = await import(
      "../../../src/api/operations/resume-state-integrity.js"
    );
    const authenticated = authenticateResumeState(resumeState());
    const withResults = {
      ...authenticated,
      state: { ...authenticated.state, actionResults: { external: "verified separately" } },
    };

    expect(() => assertResumeStateIntegrity(withResults)).not.toThrow();
  });
});
