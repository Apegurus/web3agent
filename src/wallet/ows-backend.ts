import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { owsToViemAccount } from "@open-wallet-standard/adapters/viem";
import {
  deleteWallet,
  exportWallet,
  importWalletMnemonic,
  importWalletPrivateKey,
  listWallets,
  renameWallet,
} from "@open-wallet-standard/core";
import type { Account, Hex } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import type { WalletMode, WalletState } from "../types/wallet.js";
import { atomicWriteJson, ensureSecureDir } from "../utils/atomic-write.js";
import type { WalletBackend } from "./backend.js";
import { walletEvents } from "./events.js";
import { migrateLegacyWalletToOws } from "./migration.js";
import { OWS_ACTIVE_WALLET_NAME, OWS_METADATA_FILE_NAME } from "./ows-constants.js";
import { isRecord, normalizePrivateKey, requirePrivateKey } from "./wallet-utils.js";

export { OWS_ACTIVE_WALLET_NAME } from "./ows-constants.js";

const OWS_DEFAULT_VAULT_PATH = join(homedir(), ".web3agent", "ows");
const VALID_MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

interface OwsWalletBackendOptions {
  passphrase?: string;
  vaultPath?: string;
}

interface OwsWalletMetadata {
  activeMode?: Exclude<WalletMode, "read-only">;
  activeAccountIndex?: number;
  activeAddressIndex?: number;
}

interface WalletSummary {
  id: string;
  name: string;
}

function isWalletSummary(value: unknown): value is WalletSummary {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function resolvePassphrase(passphrase?: string): string {
  const resolved = passphrase ?? process.env.OWS_PASSPHRASE;
  if (resolved === undefined || resolved.trim() === "") {
    throw new Error("[wallet] OWS passphrase is required and must be non-empty");
  }
  return resolved;
}

function isMnemonicLike(secret: string): boolean {
  const words = secret
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return VALID_MNEMONIC_WORD_COUNTS.has(words.length);
}

type ParsedWalletExport =
  | { type: "json"; value: unknown }
  | { type: "mnemonic"; value: string }
  | { type: "unknown" };

function parseWalletExport(secret: string): ParsedWalletExport {
  const trimmed = secret.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { type: "json", value: JSON.parse(trimmed) };
    } catch (error: unknown) {
      throw new Error(
        `[wallet] Failed to parse exported OWS wallet payload: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (isMnemonicLike(trimmed)) {
    return { type: "mnemonic", value: trimmed };
  }

  return { type: "unknown" };
}

function extractSecp256k1Key(value: unknown): string | null {
  if (typeof value === "string") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = extractSecp256k1Key(item);
      if (match !== null) return match;
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const secp256k1 = value.secp256k1;
  if (typeof secp256k1 === "string") {
    return secp256k1;
  }

  for (const nestedValue of Object.values(value)) {
    const match = extractSecp256k1Key(nestedValue);
    if (match !== null) return match;
  }

  return null;
}

function warnAndReturnRawKey(privateKey: string): string {
  process.stderr.write("[wallet] WARNING: Raw key exported for subprocess (GOAT compatibility)\n");
  return privateKey;
}

export class OwsWalletBackend implements WalletBackend {
  private readonly passphrase: string;
  private readonly vaultPath: string;
  private currentState: WalletState = {
    mode: "read-only",
    chainId: 1,
    accountIndex: 0,
    addressIndex: 0,
  };
  private currentAccount: Account | null = null;
  private currentWalletName: string | null = null;
  private metadataWriteChain: Promise<void> = Promise.resolve();
  private currentPrivateKey: Hex | null = null;
  private currentMnemonic: string | null = null;

  constructor(options: OwsWalletBackendOptions = {}) {
    this.passphrase = resolvePassphrase(options.passphrase);
    this.vaultPath = options.vaultPath ?? OWS_DEFAULT_VAULT_PATH;
  }

  get info() {
    return {
      type: "ows",
      reason: "OWS wallet backend available with encrypted vault support",
      vaultPath: this.vaultPath,
    } as const;
  }

  async initialize(config: {
    chainId: number;
    accountIndex: number;
    addressIndex: number;
    privateKey?: string;
    mnemonic?: string;
  }): Promise<void> {
    this.currentState = {
      ...this.currentState,
      chainId: config.chainId,
      accountIndex: config.accountIndex,
      addressIndex: config.addressIndex,
    };

    if (config.privateKey) {
      this.loadInMemoryKey(requirePrivateKey(config.privateKey), this.currentState.chainId);
      return;
    }

    if (config.mnemonic) {
      this.loadInMemoryMnemonic(
        config.mnemonic,
        this.currentState.chainId,
        config.accountIndex,
        config.addressIndex
      );
      return;
    }

    if (this.hasWalletNamed(OWS_ACTIVE_WALLET_NAME)) {
      const metadata = await this.readMetadata();
      const activeMode = metadata?.activeMode ?? this.inferModeFromExport(OWS_ACTIVE_WALLET_NAME);
      const accountIndex = metadata?.activeAccountIndex ?? config.accountIndex;
      const addressIndex = metadata?.activeAddressIndex ?? config.addressIndex;

      await this.loadWallet({
        walletName: OWS_ACTIVE_WALLET_NAME,
        mode: activeMode,
        chainId: config.chainId,
        accountIndex,
        addressIndex,
      });
      return;
    }

    await migrateLegacyWalletToOws({ passphrase: this.passphrase, vaultPath: this.vaultPath });

    if (this.hasWalletNamed(OWS_ACTIVE_WALLET_NAME)) {
      const metadata = await this.readMetadata();
      const activeMode = metadata?.activeMode ?? this.inferModeFromExport(OWS_ACTIVE_WALLET_NAME);
      const accountIndex = metadata?.activeAccountIndex ?? config.accountIndex;
      const addressIndex = metadata?.activeAddressIndex ?? config.addressIndex;

      await this.loadWallet({
        walletName: OWS_ACTIVE_WALLET_NAME,
        mode: activeMode,
        chainId: config.chainId,
        accountIndex,
        addressIndex,
      });
      return;
    }

    this.loadReadOnlyAccount({
      chainId: config.chainId,
      accountIndex: config.accountIndex,
      addressIndex: config.addressIndex,
    });
  }

  getState(): WalletState {
    return { ...this.currentState };
  }

  getAccount(): Account {
    if (this.currentAccount === null) {
      throw new Error("[wallet] Wallet not initialized — call initialize() first");
    }
    return this.currentAccount;
  }

  async activate(params: {
    privateKey?: string;
    mnemonic?: string;
    accountIndex?: number;
    addressIndex?: number;
  }): Promise<WalletState> {
    const chainId = this.currentState.chainId;
    const accountIndex = params.accountIndex ?? 0;
    const addressIndex = params.addressIndex ?? 0;
    const privateKey = params.privateKey;
    const mnemonic = params.mnemonic;

    if (privateKey !== undefined) {
      await this.replaceWallet(
        OWS_ACTIVE_WALLET_NAME,
        (walletName) =>
          importWalletPrivateKey(
            walletName,
            requirePrivateKey(privateKey),
            this.passphrase,
            this.vaultPath,
            "evm"
          ),
        {
          activeMode: "private-key",
          activeAccountIndex: 0,
          activeAddressIndex: 0,
        }
      );

      await this.loadWallet({
        walletName: OWS_ACTIVE_WALLET_NAME,
        mode: "private-key",
        chainId,
        accountIndex: 0,
        addressIndex: 0,
      });
      return this.getState();
    }

    if (mnemonic !== undefined) {
      await this.replaceWallet(
        OWS_ACTIVE_WALLET_NAME,
        (walletName) =>
          importWalletMnemonic(walletName, mnemonic, this.passphrase, accountIndex, this.vaultPath),
        {
          activeMode: "mnemonic",
          activeAccountIndex: accountIndex,
          activeAddressIndex: addressIndex,
        }
      );

      await this.loadWallet({
        walletName: OWS_ACTIVE_WALLET_NAME,
        mode: "mnemonic",
        chainId,
        accountIndex,
        addressIndex,
      });
      return this.getState();
    }

    throw new Error("[wallet] Either privateKey or mnemonic must be provided");
  }

  async deactivate(): Promise<void> {
    this.currentPrivateKey = null;
    this.currentMnemonic = null;
    this.loadReadOnlyAccount({
      chainId: this.currentState.chainId,
      accountIndex: 0,
      addressIndex: 0,
    });
  }

  async deletePersistedWallet(): Promise<void> {
    if (this.hasWalletNamed(OWS_ACTIVE_WALLET_NAME)) {
      deleteWallet(OWS_ACTIVE_WALLET_NAME, this.vaultPath);
    }

    await this.writeMetadata({});
    await this.deactivate();
  }

  async getKeyForSubprocess(): Promise<string | null> {
    if (this.currentPrivateKey !== null) {
      return warnAndReturnRawKey(this.currentPrivateKey);
    }
    if (this.currentMnemonic !== null) {
      const account = mnemonicToAccount(this.currentMnemonic, {
        accountIndex: this.currentState.accountIndex,
        addressIndex: this.currentState.addressIndex,
      });
      const hdKey = account.getHdKey();
      if (hdKey.privateKey === null) {
        return null;
      }
      const normalizedKey = normalizePrivateKey(Buffer.from(hdKey.privateKey).toString("hex"));
      return normalizedKey === null ? null : warnAndReturnRawKey(normalizedKey);
    }

    if (
      this.currentState.mode === "read-only" ||
      this.currentWalletName !== OWS_ACTIVE_WALLET_NAME
    ) {
      return null;
    }

    const parsedExport = parseWalletExport(
      exportWallet(OWS_ACTIVE_WALLET_NAME, this.passphrase, this.vaultPath)
    );

    if (parsedExport.type === "mnemonic") {
      const account = mnemonicToAccount(parsedExport.value, {
        accountIndex: this.currentState.accountIndex,
        addressIndex: this.currentState.addressIndex,
      });
      const hdKey = account.getHdKey();
      if (hdKey.privateKey === null) {
        return null;
      }
      const normalizedKey = normalizePrivateKey(Buffer.from(hdKey.privateKey).toString("hex"));
      return normalizedKey === null ? null : warnAndReturnRawKey(normalizedKey);
    }

    if (parsedExport.type !== "json") {
      return null;
    }

    const privateKey = extractSecp256k1Key(parsedExport.value);
    if (privateKey === null) return null;
    const normalizedKey = normalizePrivateKey(privateKey);
    return normalizedKey === null ? null : warnAndReturnRawKey(normalizedKey);
  }

  private async replaceWallet(
    walletName: string,
    create: (walletName: string) => unknown,
    metadata: OwsWalletMetadata
  ): Promise<void> {
    await ensureSecureDir(this.vaultPath);

    const backupWalletName = `${walletName}-backup-${randomUUID()}`;
    const hasExistingWallet = this.hasWalletNamed(walletName);

    try {
      if (hasExistingWallet) {
        renameWallet(walletName, backupWalletName, this.vaultPath);
      }

      create(walletName);
      if (!this.hasWalletNamed(walletName)) {
        throw new Error("[wallet] OWS replacement import did not create the active wallet");
      }

      await this.writeMetadata(metadata);

      if (hasExistingWallet && this.hasWalletNamed(backupWalletName)) {
        deleteWallet(backupWalletName, this.vaultPath);
      }
    } catch (error: unknown) {
      if (this.hasWalletNamed(walletName)) {
        deleteWallet(walletName, this.vaultPath);
      }
      if (hasExistingWallet && this.hasWalletNamed(backupWalletName)) {
        renameWallet(backupWalletName, walletName, this.vaultPath);
      }
      throw error;
    }
  }

  private loadInMemoryKey(privateKey: Hex, chainId: number): void {
    const account = privateKeyToAccount(privateKey);
    this.currentAccount = account;
    this.currentWalletName = null;
    this.currentPrivateKey = privateKey;
    this.currentMnemonic = null;
    this.currentState = {
      mode: "private-key",
      address: account.address,
      chainId,
      accountIndex: 0,
      addressIndex: 0,
    };
    walletEvents.emit("wallet-changed", this.currentState);
  }

  private loadInMemoryMnemonic(
    mnemonic: string,
    chainId: number,
    accountIndex: number,
    addressIndex: number
  ): void {
    const account = mnemonicToAccount(mnemonic, { accountIndex, addressIndex });
    this.currentAccount = account;
    this.currentWalletName = null;
    this.currentPrivateKey = null;
    this.currentMnemonic = mnemonic;
    this.currentState = {
      mode: "mnemonic",
      address: account.address,
      chainId,
      accountIndex,
      addressIndex,
    };
    walletEvents.emit("wallet-changed", this.currentState);
  }

  private loadReadOnlyAccount(config: {
    chainId: number;
    accountIndex: number;
    addressIndex: number;
  }): void {
    const account = privateKeyToAccount(generatePrivateKey());
    this.currentAccount = account;
    this.currentWalletName = null;
    this.currentPrivateKey = null;
    this.currentMnemonic = null;
    this.currentState = {
      mode: "read-only",
      address: account.address,
      chainId: config.chainId,
      accountIndex: config.accountIndex,
      addressIndex: config.addressIndex,
    };
    walletEvents.emit("wallet-changed", this.currentState);
  }

  private async loadWallet(config: {
    walletName: string;
    mode: WalletMode;
    chainId: number;
    accountIndex: number;
    addressIndex: number;
  }): Promise<void> {
    const account = this.resolveAccount(
      config.walletName,
      config.mode,
      config.chainId,
      config.accountIndex,
      config.addressIndex
    );
    this.currentAccount = account;
    this.currentWalletName = config.walletName;
    this.currentPrivateKey = null;
    this.currentMnemonic = null;
    this.currentState = {
      mode: config.mode,
      address: account.address,
      chainId: config.chainId,
      accountIndex: config.accountIndex,
      addressIndex: config.addressIndex,
    };
    walletEvents.emit("wallet-changed", this.currentState);
  }

  private resolveAccount(
    walletName: string,
    mode: WalletMode,
    chainId: number,
    accountIndex: number,
    addressIndex: number
  ): Account {
    if (mode === "mnemonic" && (accountIndex !== 0 || addressIndex !== 0)) {
      const parsedExport = parseWalletExport(
        exportWallet(walletName, this.passphrase, this.vaultPath)
      );
      if (parsedExport.type !== "mnemonic") {
        throw new Error("[wallet] Expected mnemonic export for mnemonic wallet");
      }
      const account = mnemonicToAccount(parsedExport.value, { accountIndex, addressIndex });
      const hdKey = account.getHdKey();
      if (hdKey.privateKey === null) {
        throw new Error("[wallet] Unable to derive private key for mnemonic wallet");
      }
      return privateKeyToAccount(requirePrivateKey(Buffer.from(hdKey.privateKey).toString("hex")));
    }

    return owsToViemAccount(walletName, {
      chain: `eip155:${chainId}`,
      passphrase: this.passphrase,
      index: addressIndex,
      vaultPath: this.vaultPath,
    });
  }

  private hasWalletNamed(walletName: string): boolean {
    return listWallets(this.vaultPath).some(
      (wallet) => isWalletSummary(wallet) && wallet.name === walletName
    );
  }

  private inferModeFromExport(walletName: string): Exclude<WalletMode, "read-only"> {
    const parsedExport = parseWalletExport(
      exportWallet(walletName, this.passphrase, this.vaultPath)
    );
    return parsedExport.type === "mnemonic" ? "mnemonic" : "private-key";
  }

  private async readMetadata(): Promise<OwsWalletMetadata | null> {
    try {
      const raw = await readFile(this.getMetadataPath(), "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) {
        return null;
      }

      const activeMode = parsed.activeMode;
      const activeAccountIndex = parsed.activeAccountIndex;
      const activeAddressIndex = parsed.activeAddressIndex;

      return {
        activeMode:
          activeMode === "private-key" || activeMode === "mnemonic" ? activeMode : undefined,
        activeAccountIndex: typeof activeAccountIndex === "number" ? activeAccountIndex : undefined,
        activeAddressIndex: typeof activeAddressIndex === "number" ? activeAddressIndex : undefined,
      };
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      process.stderr.write(
        "[wallet] Failed to read OWS wallet metadata; ignoring stored metadata\n"
      );
      return null;
    }
  }

  private async writeMetadata(metadata: OwsWalletMetadata): Promise<void> {
    const work = this.metadataWriteChain
      .catch((error: unknown) => {
        process.stderr.write(
          `[wallet] Prior OWS metadata write failed: ${error instanceof Error ? error.message : String(error)}\n`
        );
      })
      .then(() => atomicWriteJson(this.getMetadataPath(), metadata));
    this.metadataWriteChain = work;
    await work;
  }

  private getMetadataPath(): string {
    return join(this.vaultPath, OWS_METADATA_FILE_NAME);
  }
}
