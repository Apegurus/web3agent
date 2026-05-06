import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockWallet = vi.hoisted(() => ({
  selectWalletBackend: vi.fn(),
  resetWalletBackend: vi.fn(),
  activateWallet: vi.fn(),
}));

const mockTty = vi.hoisted(() => ({
  assertInteractiveTty: vi.fn(),
  assertNoJsonModeForSecrets: vi.fn(),
  writeSecretToTty: vi.fn(),
}));

const mockUtils = vi.hoisted(() => ({
  hasConfiguredOwsPassphrase: vi.fn(),
  detectOwsAvailability: vi.fn(),
}));

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockFs.readFile(...args),
}));

vi.mock("../../src/wallet/backend-selector.js", () => ({
  selectWalletBackend: (...args: unknown[]) => mockWallet.selectWalletBackend(...args),
  resetWalletBackend: (...args: unknown[]) => mockWallet.resetWalletBackend(...args),
  detectOwsAvailability: (...args: unknown[]) => mockUtils.detectOwsAvailability(...args),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  activateWallet: (...args: unknown[]) => mockWallet.activateWallet(...args),
}));

vi.mock("../../src/cli/tty-secret.js", () => ({
  assertInteractiveTty: (...args: unknown[]) => mockTty.assertInteractiveTty(...args),
  assertNoJsonModeForSecrets: (...args: unknown[]) => mockTty.assertNoJsonModeForSecrets(...args),
  writeSecretToTty: (...args: unknown[]) => mockTty.writeSecretToTty(...args),
  TtySecretError: class TtySecretError extends Error {
    readonly exitCode: number;
    readonly errorCode: string;
    constructor(code: string, message: string, exitCode = 1) {
      super(message);
      this.name = "TtySecretError";
      this.errorCode = code;
      this.exitCode = exitCode;
    }
  },
}));

vi.mock("../../src/wallet/wallet-utils.js", () => ({
  hasConfiguredOwsPassphrase: (...args: unknown[]) => mockUtils.hasConfiguredOwsPassphrase(...args),
}));

vi.mock("viem/accounts", () => ({
  generatePrivateKey: () => "0xfake_test_private_key_0000000000000000000000000000000000000001",
  generateMnemonic: () => "test test test test test test test test test test test junk",
  english: ["abandon"],
}));

type StreamName = "stdin" | "stdout" | "stderr";

function setTty(stream: StreamName, value: boolean | undefined): void {
  Object.defineProperty(process[stream], "isTTY", { value, configurable: true });
}

function setAllTty(value: boolean): void {
  setTty("stdin", value);
  setTty("stdout", value);
  setTty("stderr", value);
}

function setupHappyPath(): void {
  setAllTty(true);
  mockUtils.hasConfiguredOwsPassphrase.mockReturnValue(true);
  mockUtils.detectOwsAvailability.mockReturnValue(true);
  mockWallet.selectWalletBackend.mockResolvedValue({
    info: { type: "ows", reason: "configured" },
  });
  mockWallet.activateWallet.mockResolvedValue({
    mode: "private-key" as const,
    address: "0xFAKE_ADDRESS_FOR_TESTS",
    chainId: 8453,
    accountIndex: 0,
    addressIndex: 0,
  });
}

describe("runWalletCommand", () => {
  let stderr: string;
  let stdout: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stderr = "";
    stdout = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    setAllTty(true);
    vi.restoreAllMocks();
  });

  describe("help output", () => {
    it("prints help to stderr when no subcommand given", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand([]);
      expect(stderr).toContain("wallet");
      expect(stderr).toContain("generate");
    });

    it("prints help when --help flag is passed", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["--help"]);
      expect(stderr).toContain("generate");
    });
  });

  describe("--json rejection", () => {
    it("calls assertNoJsonModeForSecrets with full args for generate", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);
      expect(mockTty.assertNoJsonModeForSecrets).toHaveBeenCalled();
    });

    it("calls assertNoJsonModeForSecrets with full args for generate --mnemonic", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate", "--mnemonic"]);
      expect(mockTty.assertNoJsonModeForSecrets).toHaveBeenCalled();
    });
  });

  describe("TTY enforcement", () => {
    it("calls assertInteractiveTty before generating", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);
      expect(mockTty.assertInteractiveTty).toHaveBeenCalled();
    });
  });

  describe("OWS requirement", () => {
    it("throws when OWS passphrase is not configured", async () => {
      setupHappyPath();
      mockUtils.hasConfiguredOwsPassphrase.mockReturnValue(false);
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await expect(runWalletCommand(["generate"])).rejects.toThrow(/OWS/i);
    });

    it("throws when OWS is not available", async () => {
      setupHappyPath();
      mockUtils.detectOwsAvailability.mockReturnValue(false);
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await expect(runWalletCommand(["generate"])).rejects.toThrow(/OWS/i);
    });
  });

  describe("generate (private key)", () => {
    it("generates a private key, activates wallet, and writes secret to TTY", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);

      expect(mockWallet.activateWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: expect.stringContaining("0x"),
        })
      );

      expect(mockTty.writeSecretToTty).toHaveBeenCalledWith(
        expect.stringMatching(/private key/i),
        expect.stringContaining("0x")
      );
    });

    it("does not write the secret to stdout", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);
      expect(stdout).not.toContain("0xfake_test_private_key");
    });

    it("writes the address to stderr after generation", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);
      expect(stderr).toContain("0xFAKE_ADDRESS_FOR_TESTS");
    });

    it("selects OWS wallet backend before activating", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);

      const selectOrder = mockWallet.selectWalletBackend.mock.invocationCallOrder[0];
      const activateOrder = mockWallet.activateWallet.mock.invocationCallOrder[0];
      expect(selectOrder).toBeLessThan(activateOrder);
    });
  });

  describe("generate --mnemonic", () => {
    it("generates a mnemonic, activates wallet, and writes secret to TTY", async () => {
      setupHappyPath();
      mockWallet.activateWallet.mockResolvedValue({
        mode: "mnemonic" as const,
        address: "0xFAKE_MNEMONIC_ADDRESS",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      });

      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate", "--mnemonic"]);

      expect(mockWallet.activateWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          mnemonic: expect.stringContaining("test"),
        })
      );

      expect(mockTty.writeSecretToTty).toHaveBeenCalledWith(
        expect.stringMatching(/mnemonic/i),
        expect.stringContaining("test")
      );
    });

    it("does not write the mnemonic to stdout", async () => {
      setupHappyPath();
      mockWallet.activateWallet.mockResolvedValue({
        mode: "mnemonic" as const,
        address: "0xFAKE_MNEMONIC_ADDRESS",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      });
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate", "--mnemonic"]);
      expect(stdout).not.toContain("test test test");
    });

    it("writes the address to stderr after mnemonic generation", async () => {
      setupHappyPath();
      mockWallet.activateWallet.mockResolvedValue({
        mode: "mnemonic" as const,
        address: "0xFAKE_MNEMONIC_ADDRESS",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      });
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate", "--mnemonic"]);
      expect(stderr).toContain("0xFAKE_MNEMONIC_ADDRESS");
    });
  });

  describe("gate ordering", () => {
    it("checks --json before checking TTY", async () => {
      setupHappyPath();
      const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
      await runWalletCommand(["generate"]);
      const jsonOrder = mockTty.assertNoJsonModeForSecrets.mock.invocationCallOrder[0];
      const ttyOrder = mockTty.assertInteractiveTty.mock.invocationCallOrder[0];
      expect(jsonOrder).toBeLessThan(ttyOrder);
    });
  });

  describe("activate --from-file", () => {
    function setupActivateHappyPath(
      fileContent: string,
      mode: "private-key" | "mnemonic" = "private-key"
    ): void {
      setupHappyPath();
      mockFs.readFile.mockResolvedValue(fileContent);
      mockWallet.activateWallet.mockResolvedValue({
        mode,
        address: "0xIMPORTED_ADDRESS_FOR_TESTS",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      });
    }

    describe("private-key import", () => {
      it("reads file, trims whitespace, and activates with privateKey", async () => {
        setupActivateHappyPath(
          "0xfake_test_imported_key_000000000000000000000000000000000000002\n"
        );
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(mockFs.readFile).toHaveBeenCalledWith("./secret.txt", "utf-8");
        expect(mockWallet.activateWallet).toHaveBeenCalledWith({
          privateKey: "0xfake_test_imported_key_000000000000000000000000000000000000002",
        });
      });

      it("writes address to stderr on success", async () => {
        setupActivateHappyPath(
          "0xfake_test_imported_key_000000000000000000000000000000000000002\n"
        );
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(stderr).toContain("0xIMPORTED_ADDRESS_FOR_TESTS");
      });

      it("does not write the imported secret to stdout or stderr", async () => {
        setupActivateHappyPath("0xfake_test_imported_key_000000000000000000000000000000000000002");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(stdout).not.toContain("0xfake_test_imported_key");
        expect(stderr).not.toContain("0xfake_test_imported_key");
      });

      it("does not call writeSecretToTty", async () => {
        setupActivateHappyPath("0xfake_test_imported_key_000000000000000000000000000000000000002");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(mockTty.writeSecretToTty).not.toHaveBeenCalled();
      });
    });

    describe("mnemonic import", () => {
      it("reads file, trims whitespace, and activates with mnemonic", async () => {
        setupActivateHappyPath(
          "fake word one two three four five six seven eight nine ten eleven\n  ",
          "mnemonic"
        );
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand(["activate", "--from-file", "./mnemonic.txt", "--type", "mnemonic"]);

        expect(mockFs.readFile).toHaveBeenCalledWith("./mnemonic.txt", "utf-8");
        expect(mockWallet.activateWallet).toHaveBeenCalledWith({
          mnemonic: "fake word one two three four five six seven eight nine ten eleven",
        });
      });

      it("does not write the imported mnemonic to stdout or stderr", async () => {
        setupActivateHappyPath(
          "fake word one two three four five six seven eight nine ten eleven",
          "mnemonic"
        );
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand(["activate", "--from-file", "./mnemonic.txt", "--type", "mnemonic"]);

        expect(stdout).not.toContain("fake word one");
        expect(stderr).not.toContain("fake word one");
      });
    });

    describe("safety gates", () => {
      it("rejects --json flag before reading file", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(mockTty.assertNoJsonModeForSecrets).toHaveBeenCalled();
        const jsonOrder = mockTty.assertNoJsonModeForSecrets.mock.invocationCallOrder[0];
        const readOrder = mockFs.readFile.mock.invocationCallOrder[0];
        expect(jsonOrder).toBeLessThan(readOrder);
      });

      it("requires interactive TTY", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        expect(mockTty.assertInteractiveTty).toHaveBeenCalled();
      });

      it("requires OWS passphrase", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        mockUtils.hasConfiguredOwsPassphrase.mockReturnValue(false);
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand(["activate", "--from-file", "./secret.txt", "--type", "private-key"])
        ).rejects.toThrow(/OWS/i);
      });

      it("requires OWS availability", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        mockUtils.detectOwsAvailability.mockReturnValue(false);
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand(["activate", "--from-file", "./secret.txt", "--type", "private-key"])
        ).rejects.toThrow(/OWS/i);
      });

      it("selects OWS backend before activating", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand([
          "activate",
          "--from-file",
          "./secret.txt",
          "--type",
          "private-key",
        ]);

        const selectOrder = mockWallet.selectWalletBackend.mock.invocationCallOrder[0];
        const activateOrder = mockWallet.activateWallet.mock.invocationCallOrder[0];
        expect(selectOrder).toBeLessThan(activateOrder);
      });
    });

    describe("argument validation", () => {
      it("rejects positional arg that looks like a private key", async () => {
        setupHappyPath();
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand(["activate", "0xfake_test_key_000000000000000000000000000000"])
        ).rejects.toThrow(/positional.*secret|secret.*positional|--from-file/i);
      });

      it("rejects positional arg that looks like a mnemonic", async () => {
        setupHappyPath();
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand([
            "activate",
            "word1",
            "word2",
            "word3",
            "word4",
            "word5",
            "word6",
            "word7",
            "word8",
            "word9",
            "word10",
            "word11",
            "word12",
          ])
        ).rejects.toThrow(/positional.*secret|secret.*positional|--from-file/i);
      });

      it("requires --type flag", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(runWalletCommand(["activate", "--from-file", "./secret.txt"])).rejects.toThrow(
          /--type/i
        );
      });

      it("requires --from-file flag", async () => {
        setupHappyPath();
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(runWalletCommand(["activate", "--type", "private-key"])).rejects.toThrow(
          /--from-file/i
        );
      });

      it("rejects invalid --type value", async () => {
        setupActivateHappyPath("0xfake_test_key_00000000000000000000000000000000000003");
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand(["activate", "--from-file", "./secret.txt", "--type", "seed-phrase"])
        ).rejects.toThrow(/--type.*private-key.*mnemonic|invalid.*type/i);
      });
    });

    describe("file errors", () => {
      it("throws a clear error when file does not exist", async () => {
        setupHappyPath();
        mockFs.readFile.mockRejectedValue(
          Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" })
        );
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await expect(
          runWalletCommand([
            "activate",
            "--from-file",
            "./nonexistent.txt",
            "--type",
            "private-key",
          ])
        ).rejects.toThrow(/file|read|ENOENT/i);
      });
    });

    describe("help output", () => {
      it("help text includes activate subcommand", async () => {
        setupHappyPath();
        const { runWalletCommand } = await import("../../src/cli/commands/wallet.js");
        await runWalletCommand(["--help"]);
        expect(stderr).toContain("activate");
        expect(stderr).toContain("--from-file");
      });
    });
  });
});
