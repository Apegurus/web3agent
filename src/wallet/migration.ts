import { constants, existsSync } from "node:fs";
import { copyFile, readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { importWalletMnemonic, importWalletPrivateKey } from "@open-wallet-standard/core";
import { type Hex, isHex } from "viem";
import { atomicWriteJson } from "../utils/atomic-write.js";
import { OWS_ACTIVE_WALLET_NAME, OWS_METADATA_FILE_NAME } from "./ows-constants.js";

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

function normalizePrivateKey(privateKey: string): Hex {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!isHex(normalized, { strict: true }) || normalized.length !== 66) {
    throw new Error("[wallet] Legacy wallet.json contains an invalid private key");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  return parseLegacyWallet(JSON.parse(raw));
}

export async function migrateLegacyWalletToOws(options: MigrationOptions): Promise<boolean> {
  const walletPath = options.legacyWalletPath ?? defaultLegacyWalletPath();
  const migratedPath = `${walletPath}.migrated`;
  const legacyWallet = await readLegacyWallet(walletPath);
  if (legacyWallet === null) return false;

  if (existsSync(migratedPath)) {
    throw new Error("[wallet] Refusing to overwrite existing wallet.json.migrated");
  }

  process.stderr.write("[wallet] Found legacy wallet.json — importing into OWS vault...\n");

  if (legacyWallet.type === "private-key") {
    importWalletPrivateKey(
      OWS_ACTIVE_WALLET_NAME,
      normalizePrivateKey(legacyWallet.privateKey),
      options.passphrase,
      options.vaultPath,
      "evm"
    );
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
    await atomicWriteJson(join(options.vaultPath, OWS_METADATA_FILE_NAME), {
      activeMode: "mnemonic",
      activeAccountIndex: accountIndex,
      activeAddressIndex: addressIndex,
    });
  }

  await copyFile(walletPath, migratedPath, constants.COPYFILE_EXCL);
  await unlink(walletPath);
  process.stderr.write(
    "[wallet] Migration complete. Legacy wallet backed up to wallet.json.migrated\n"
  );
  return true;
}
