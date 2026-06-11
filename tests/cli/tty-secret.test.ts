import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StreamName = "stdin" | "stdout" | "stderr";

function setTty(stream: StreamName, value: boolean | undefined): void {
  Object.defineProperty(process[stream], "isTTY", { value, configurable: true });
}

function setAllTty(value: boolean): void {
  setTty("stdin", value);
  setTty("stdout", value);
  setTty("stderr", value);
}

describe("isInteractiveTty", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setAllTty(true);
  });

  it("returns true when stdin, stdout, and stderr are all TTYs", async () => {
    setAllTty(true);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(true);
  });

  it("returns false when stdin is not a TTY", async () => {
    setAllTty(true);
    setTty("stdin", false);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when stdout is not a TTY", async () => {
    setAllTty(true);
    setTty("stdout", false);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when stderr is not a TTY", async () => {
    setAllTty(true);
    setTty("stderr", false);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when stdin isTTY is undefined", async () => {
    setAllTty(true);
    setTty("stdin", undefined);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when stdout isTTY is undefined", async () => {
    setAllTty(true);
    setTty("stdout", undefined);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when stderr isTTY is undefined", async () => {
    setAllTty(true);
    setTty("stderr", undefined);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });

  it("returns false when all streams are non-TTY", async () => {
    setAllTty(false);
    const { isInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(isInteractiveTty()).toBe(false);
  });
});

describe("assertInteractiveTty", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setAllTty(true);
  });

  it("does not throw when all three streams are TTYs", async () => {
    setAllTty(true);
    const { assertInteractiveTty } = await import("../../src/cli/tty-secret.js");
    expect(() => assertInteractiveTty()).not.toThrow();
  });

  it("throws TtySecretError with LOCAL_TTY_REQUIRED when stdin is not a TTY", async () => {
    setAllTty(true);
    setTty("stdin", false);
    const { assertInteractiveTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => assertInteractiveTty()).toThrow(TtySecretError);
    try {
      assertInteractiveTty();
    } catch (e: unknown) {
      if (e instanceof TtySecretError) {
        expect(e.errorCode).toBe("LOCAL_TTY_REQUIRED");
        expect(e.exitCode).toBe(1);
        expect(e.message).toMatch(/interactive/i);
      }
    }
  });

  it("throws TtySecretError with LOCAL_TTY_REQUIRED when stdout is not a TTY", async () => {
    setAllTty(true);
    setTty("stdout", false);
    const { assertInteractiveTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => assertInteractiveTty()).toThrow(TtySecretError);
  });

  it("throws TtySecretError with LOCAL_TTY_REQUIRED when stderr is not a TTY", async () => {
    setAllTty(true);
    setTty("stderr", false);
    const { assertInteractiveTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => assertInteractiveTty()).toThrow(TtySecretError);
  });

  it("throws when all streams are non-TTY", async () => {
    setAllTty(false);
    const { assertInteractiveTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => assertInteractiveTty()).toThrow(TtySecretError);
  });
});

describe("writeSecretToTty", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setAllTty(true);
  });

  it("writes secret to stderr (not stdout) when all streams are TTYs", async () => {
    setAllTty(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { writeSecretToTty } = await import("../../src/cli/tty-secret.js");
    writeSecretToTty("label", "FAKE_SECRET_VALUE_FOR_TEST");

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("label"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("FAKE_SECRET_VALUE_FOR_TEST"));
    const stdoutCalls = stdoutWrite.mock.calls.map((c) => String(c[0]));
    for (const call of stdoutCalls) {
      expect(call).not.toContain("FAKE_SECRET_VALUE_FOR_TEST");
    }

    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });

  it("throws TtySecretError when stdin is not a TTY", async () => {
    setAllTty(true);
    setTty("stdin", false);
    const { writeSecretToTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => writeSecretToTty("label", "FAKE_SECRET_VALUE_FOR_TEST")).toThrow(TtySecretError);
  });

  it("throws TtySecretError when stdout is not a TTY", async () => {
    setAllTty(true);
    setTty("stdout", false);
    const { writeSecretToTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => writeSecretToTty("label", "FAKE_SECRET_VALUE_FOR_TEST")).toThrow(TtySecretError);
  });

  it("throws TtySecretError and does not write secret when stderr is not a TTY", async () => {
    setAllTty(true);
    setTty("stderr", false);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { writeSecretToTty, TtySecretError } = await import("../../src/cli/tty-secret.js");
    expect(() => writeSecretToTty("label", "FAKE_SECRET_VALUE_FOR_TEST")).toThrow(TtySecretError);

    const stderrCalls = stderrWrite.mock.calls.map((c) => String(c[0]));
    for (const call of stderrCalls) {
      expect(call).not.toContain("FAKE_SECRET_VALUE_FOR_TEST");
    }

    stderrWrite.mockRestore();
  });
});

describe("assertNoJsonModeForSecrets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not throw when --json flag is absent", async () => {
    const { assertNoJsonModeForSecrets } = await import("../../src/cli/tty-secret.js");
    expect(() => assertNoJsonModeForSecrets(["wallet", "show"])).not.toThrow();
  });

  it("throws TtySecretError with JSON_MODE_FORBIDDEN when --json flag is present", async () => {
    const { assertNoJsonModeForSecrets, TtySecretError } = await import(
      "../../src/cli/tty-secret.js"
    );
    expect(() => assertNoJsonModeForSecrets(["wallet", "show", "--json"])).toThrow(TtySecretError);
    try {
      assertNoJsonModeForSecrets(["wallet", "show", "--json"]);
    } catch (e: unknown) {
      if (e instanceof TtySecretError) {
        expect(e.errorCode).toBe("JSON_MODE_FORBIDDEN");
        expect(e.message).toMatch(/json/i);
      }
    }
  });

  it("throws TtySecretError when --json appears anywhere in args", async () => {
    const { assertNoJsonModeForSecrets, TtySecretError } = await import(
      "../../src/cli/tty-secret.js"
    );
    expect(() => assertNoJsonModeForSecrets(["--json", "wallet", "show"])).toThrow(TtySecretError);
  });
});

describe("TtySecretError", () => {
  it("is an instance of Error", async () => {
    const { TtySecretError } = await import("../../src/cli/tty-secret.js");
    const err = new TtySecretError("LOCAL_TTY_REQUIRED", "test message");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TtySecretError);
    expect(err.name).toBe("TtySecretError");
    expect(err.errorCode).toBe("LOCAL_TTY_REQUIRED");
    expect(err.exitCode).toBe(1);
    expect(err.message).toBe("test message");
  });

  it("accepts custom exit code", async () => {
    const { TtySecretError } = await import("../../src/cli/tty-secret.js");
    const err = new TtySecretError("JSON_MODE_FORBIDDEN", "no json", 2);
    expect(err.exitCode).toBe(2);
  });
});
