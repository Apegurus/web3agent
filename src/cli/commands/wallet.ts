import { readFile } from "node:fs/promises";

import { english, generateMnemonic, generatePrivateKey } from "viem/accounts";

import { detectOwsAvailability, selectWalletBackend } from "../../wallet/backend-selector.js";
import { activateWallet } from "../../wallet/persistence.js";
import { hasConfiguredOwsPassphrase } from "../../wallet/wallet-utils.js";
import {
  assertInteractiveTty,
  assertNoJsonModeForSecrets,
  writeSecretToTty,
} from "../tty-secret.js";

function printHelp(): void {
  process.stderr.write(
    `${[
      "web3agent wallet — Local wallet management (OWS encrypted storage)",
      "",
      "Usage:",
      "  web3agent wallet generate              Generate a new private-key wallet",
      "  web3agent wallet generate --mnemonic    Generate a new mnemonic wallet",
      "  web3agent wallet activate --from-file <path> --type private-key",
      "  web3agent wallet activate --from-file <path> --type mnemonic",
      "",
      "Requires:",
      "  - OWS backend with OWS_PASSPHRASE set",
      "  - Interactive TTY (no piped or redirected output)",
      "  - No --json flag (secrets cannot appear in JSON output)",
    ].join("\n")}\n`
  );
}

function assertOwsAvailable(): void {
  if (!hasConfiguredOwsPassphrase()) {
    throw new Error(
      "OWS_PASSPHRASE is not set or empty. Wallet generation requires OWS encrypted storage. Set OWS_PASSPHRASE to a non-empty value."
    );
  }
  if (!detectOwsAvailability()) {
    throw new Error(
      "OWS backend is not available. Wallet generation requires @open-wallet-standard/core and a configured OWS_PASSPHRASE."
    );
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasPositionalSecretArgs(args: string[]): boolean {
  const positional = args.filter((a) => !a.startsWith("--"));
  if (positional.length === 0) return false;
  if (positional.some((a) => a.startsWith("0x"))) return true;
  if (positional.length >= 12) return true;
  return false;
}

async function handleActivate(args: string[]): Promise<void> {
  if (hasPositionalSecretArgs(args)) {
    throw new Error(
      "Secrets must not be passed as positional arguments. Use --from-file <path> to import from a file."
    );
  }

  const filePath = extractFlag(args, "--from-file");
  const secretType = extractFlag(args, "--type");

  if (!filePath) {
    throw new Error(
      "Missing --from-file <path>. Usage: web3agent wallet activate --from-file <path> --type private-key|mnemonic"
    );
  }

  if (!secretType) {
    throw new Error(
      "Missing --type flag. Usage: web3agent wallet activate --from-file <path> --type private-key|mnemonic"
    );
  }

  if (secretType !== "private-key" && secretType !== "mnemonic") {
    throw new Error(`Invalid --type "${secretType}". Must be "private-key" or "mnemonic".`);
  }

  assertNoJsonModeForSecrets(args);
  assertInteractiveTty();
  assertOwsAvailable();

  await selectWalletBackend();

  const raw = await readFile(filePath, "utf-8");
  const secret = raw.trim();

  const params = secretType === "private-key" ? { privateKey: secret } : { mnemonic: secret };
  const state = await activateWallet(params);

  process.stderr.write(
    `[wallet] Imported and stored in OWS. Address: ${state.address ?? "unknown"}\n`
  );
}

async function handleGenerate(args: string[]): Promise<void> {
  const useMnemonic = args.includes("--mnemonic");

  assertNoJsonModeForSecrets(args);
  assertInteractiveTty();
  assertOwsAvailable();

  await selectWalletBackend();

  if (useMnemonic) {
    const mnemonic = generateMnemonic(english);
    const state = await activateWallet({ mnemonic });

    writeSecretToTty("Mnemonic phrase", mnemonic);
    process.stderr.write(`[wallet] Stored in OWS. Address: ${state.address ?? "unknown"}\n`);
    process.stderr.write("[wallet] Back up this mnemonic now. It will not be shown again.\n");
  } else {
    const privateKey = generatePrivateKey();
    const state = await activateWallet({ privateKey });

    writeSecretToTty("Private key", privateKey);
    process.stderr.write(`[wallet] Stored in OWS. Address: ${state.address ?? "unknown"}\n`);
    process.stderr.write("[wallet] Back up this private key now. It will not be shown again.\n");
  }
}

export async function runWalletCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "--help") {
    printHelp();
    return;
  }

  if (subcommand === "generate") {
    await handleGenerate(args.slice(1));
    return;
  }

  if (subcommand === "activate") {
    await handleActivate(args.slice(1));
    return;
  }

  printHelp();
}
