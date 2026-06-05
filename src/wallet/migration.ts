import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  deleteWallet,
  importWalletMnemonic,
  importWalletPrivateKey,
  listWallets,
} from "@open-wallet-standard/core";
import { atomicWriteJson, ensureSecureDir, writeBytesSecure } from "../utils/atomic-write.js";
import { OWS_ACTIVE_WALLET_NAME, OWS_METADATA_FILE_NAME } from "./ows-constants.js";
import { isRecord, requirePrivateKey } from "./wallet-utils.js";

interface MigrationOptions {
  legacyWalletPath?: string;
  passphrase: string;
  vaultPath: string;
}

interface LegacyPrivateKeyWallet {
  type: "private-key";
  privateKey: string;
}

interface LegacyMnemonicWallet {
  type: "mnemonic";
  mnemonic: string;
  accountIndex?: number;
  addressIndex?: number;
}

type LegacyWallet = LegacyPrivateKeyWallet | LegacyMnemonicWallet;

function defaultLegacyWalletPath(): string {
  return join(homedir(), ".web3agent", "wallet.json");
}

function parseLegacyWallet(value: unknown): LegacyWallet | null {
  if (!isRecord(value)) return null;
  if (value.type === "private-key" && typeof value.privateKey === "string") {
    return { type: "private-key", privateKey: value.privateKey };
  }
  if (value.type === "mnemonic" && typeof value.mnemonic === "string") {
    return {
      type: "mnemonic",
      mnemonic: value.mnemonic,
      accountIndex: typeof value.accountIndex === "number" ? value.accountIndex : undefined,
      addressIndex: typeof value.addressIndex === "number" ? value.addressIndex : undefined,
    };
  }
  return null;
}

async function readLegacyWallet(walletPath: string): Promise<LegacyWallet | null> {
  if (!existsSync(walletPath)) return null;
  const raw = await readFile(walletPath, "utf-8");
  try {
    return parseLegacyWallet(JSON.parse(raw));
  } catch (error: unknown) {
    process.stderr.write(
      `[wallet] Could not parse legacy wallet.json; skipping OWS migration: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return null;
  }
}

function cleanupImportedWallet(vaultPath: string): void {
  try {
    deleteWallet(OWS_ACTIVE_WALLET_NAME, vaultPath);
  } catch (error: unknown) {
    process.stderr.write(
      `[wallet] Could not clean up incomplete OWS migration wallet: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

export async function migrateLegacyWalletToOws(options: MigrationOptions): Promise<boolean> {
  const walletPath = options.legacyWalletPath ?? defaultLegacyWalletPath();
  const migratedPath = `${walletPath}.migrated`;
  const legacyWallet = await readLegacyWallet(walletPath);
  if (legacyWallet === null) return false;

  if (existsSync(migratedPath)) {
    const vaultHasActive = listWallets(options.vaultPath).some(
      (w) =>
        typeof w === "object" &&
        w !== null &&
        "name" in w &&
        (w as { name: unknown }).name === OWS_ACTIVE_WALLET_NAME
    );
    if (vaultHasActive) {
      process.stderr.write(
        "[wallet] Detected half-migration (vault populated, wallet.json still present, .migrated already exists). Cleaning up wallet.json; backup preserved.\n"
      );
      await unlink(walletPath);
      return false;
    }
    throw new Error("[wallet] Refusing to overwrite existing wallet.json.migrated");
  }

  process.stderr.write("[wallet] Found legacy wallet.json — importing into OWS vault...\n");
  await ensureSecureDir(options.vaultPath);

  let importedWallet = false;
  try {
    if (legacyWallet.type === "private-key") {
      importWalletPrivateKey(
        OWS_ACTIVE_WALLET_NAME,
        requirePrivateKey(
          legacyWallet.privateKey,
          "[wallet] Legacy wallet.json contains an invalid private key"
        ),
        options.passphrase,
        options.vaultPath,
        "evm"
      );
      importedWallet = true;
      await atomicWriteJson(join(options.vaultPath, OWS_METADATA_FILE_NAME), {
        activeMode: "private-key",
        activeAccountIndex: 0,
        activeAddressIndex: 0,
      });
    } else {
      const accountIndex = legacyWallet.accountIndex ?? 0;
      const addressIndex = legacyWallet.addressIndex ?? 0;
      importWalletMnemonic(
        OWS_ACTIVE_WALLET_NAME,
        legacyWallet.mnemonic,
        options.passphrase,
        accountIndex,
        options.vaultPath
      );
      importedWallet = true;
      await atomicWriteJson(join(options.vaultPath, OWS_METADATA_FILE_NAME), {
        activeMode: "mnemonic",
        activeAccountIndex: accountIndex,
        activeAddressIndex: addressIndex,
      });
    }
  } catch (error: unknown) {
    if (importedWallet) {
      cleanupImportedWallet(options.vaultPath);
    }
    throw error;
  }

  const raw = await readFile(walletPath);
  await writeBytesSecure(migratedPath, raw, { excl: true, mode: 0o600 });
  await unlink(walletPath);
  process.stderr.write(
    `[wallet] Migration complete. Legacy wallet backed up to wallet.json.migrated\n[wallet] After verifying OWS wallet access, delete ${migratedPath} to remove the plaintext backup.\n`
  );
  return true;
}
