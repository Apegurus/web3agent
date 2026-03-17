import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Account } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { getConfig } from "../config/env.js";
import type { WalletMode, WalletState } from "../types/wallet.js";
import { walletEvents } from "./events.js";

export type { WalletMode };

interface PersistedPrivateKey {
  type: "private-key";
  privateKey: string;
  address: string;
}

interface PersistedMnemonic {
  type: "mnemonic";
  mnemonic: string;
  accountIndex: number;
  addressIndex: number;
}

type PersistedWallet = PersistedPrivateKey | PersistedMnemonic;

let currentState: WalletState = {
  mode: "read-only",
  chainId: 1,
  accountIndex: 0,
  addressIndex: 0,
};

let currentAccount: Account | null = null;

function getWalletDir(): string {
  return join(homedir(), ".web3agent");
}

function getWalletPath(): string {
  return join(getWalletDir(), "wallet.json");
}

function getConfiguredChainId(): number {
  try {
    return getConfig().chainId;
  } catch (_error: unknown) {
    return currentState.chainId;
  }
}

export function getWalletState(): WalletState {
  return {
    ...currentState,
    chainId: getConfiguredChainId(),
  };
}

export function getActiveAccount(): Account {
  if (!currentAccount) {
    throw new Error("Wallet not initialized — call initializeWallet() first");
  }
  return currentAccount;
}

function resolveFromPrivateKey(
  privateKey: string,
  chainId: number
): { account: Account; state: WalletState } {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return {
    account,
    state: {
      mode: "private-key",
      address: account.address,
      chainId,
      accountIndex: 0,
      addressIndex: 0,
    },
  };
}

function resolveFromMnemonic(
  mnemonic: string,
  chainId: number,
  accountIndex: number,
  addressIndex: number
): { account: Account; state: WalletState } {
  const account = mnemonicToAccount(mnemonic, {
    accountIndex,
    addressIndex,
  });
  return {
    account,
    state: {
      mode: "mnemonic",
      address: account.address,
      chainId,
      accountIndex,
      addressIndex,
    },
  };
}

function resolveEphemeral(chainId: number): {
  account: Account;
  state: WalletState;
} {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  return {
    account,
    state: {
      mode: "read-only",
      address: account.address,
      chainId,
      accountIndex: 0,
      addressIndex: 0,
    },
  };
}

async function tryLoadPersistedWallet(
  chainId: number,
  accountIndex: number,
  addressIndex: number
): Promise<{ account: Account; state: WalletState } | null> {
  const walletPath = getWalletPath();
  const tmpPath = `${walletPath}.tmp`;
  if (existsSync(tmpPath)) {
    try {
      await unlink(tmpPath);
    } catch {
      /* stale tmp file removal failed — non-fatal, continue */
    }
  }
  if (!existsSync(walletPath)) return null;

  try {
    const raw = await readFile(walletPath, "utf-8");
    const data = JSON.parse(raw) as PersistedWallet;

    if (data.type === "private-key") {
      return resolveFromPrivateKey(data.privateKey, chainId);
    }
    if (data.type === "mnemonic") {
      return resolveFromMnemonic(
        data.mnemonic,
        chainId,
        data.accountIndex ?? accountIndex,
        data.addressIndex ?? addressIndex
      );
    }
  } catch {
    /* corrupted wallet file — security: do not leak error details */
  }
  return null;
}

export async function initializeWallet(config: {
  chainId: number;
  accountIndex: number;
  addressIndex: number;
  privateKey?: string;
  mnemonic?: string;
}): Promise<void> {
  const { chainId, accountIndex, addressIndex } = config;

  const envKey = config.privateKey;
  if (envKey) {
    const resolved = resolveFromPrivateKey(envKey, chainId);
    currentAccount = resolved.account;
    currentState = resolved.state;
    walletEvents.emit("wallet-changed", currentState);
    return;
  }

  const envMnemonic = config.mnemonic;
  if (envMnemonic) {
    const resolved = resolveFromMnemonic(envMnemonic, chainId, accountIndex, addressIndex);
    currentAccount = resolved.account;
    currentState = resolved.state;
    walletEvents.emit("wallet-changed", currentState);
    return;
  }

  const persisted = await tryLoadPersistedWallet(chainId, accountIndex, addressIndex);
  if (persisted) {
    currentAccount = persisted.account;
    currentState = persisted.state;
    walletEvents.emit("wallet-changed", currentState);
    return;
  }

  const ephemeral = resolveEphemeral(chainId);
  currentAccount = ephemeral.account;
  currentState = ephemeral.state;
  walletEvents.emit("wallet-changed", currentState);
}

async function ensureWalletDir(): Promise<void> {
  const dir = getWalletDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

// Unlike confirmation/spend-tracker (fire-and-forget), persistWallet awaits the
// chain so callers like activateWallet know the write landed before proceeding.
let walletPersistChain: Promise<void> = Promise.resolve();

async function persistWallet(data: PersistedWallet): Promise<void> {
  const work = walletPersistChain
    .catch((e: unknown) => {
      process.stderr.write(`[wallet] Prior persist failed: ${e}\n`);
    })
    .then(async () => {
      await ensureWalletDir();
      const walletPath = getWalletPath();
      const tmpPath = `${walletPath}.tmp`;
      const fd = await open(tmpPath, "w", 0o600);
      try {
        await fd.writeFile(JSON.stringify(data, null, 2));
        await fd.sync();
      } finally {
        await fd.close();
      }
      await rename(tmpPath, walletPath);
    });
  walletPersistChain = work;
  await work;
}

export async function activateWallet(params: {
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
  addressIndex?: number;
}): Promise<WalletState> {
  const chainId = getConfiguredChainId();
  const accountIndex = params.accountIndex ?? 0;
  const addressIndex = params.addressIndex ?? 0;

  if (params.privateKey) {
    const resolved = resolveFromPrivateKey(params.privateKey, chainId);

    await persistWallet({
      type: "private-key",
      privateKey: params.privateKey,
      address: resolved.account.address,
    });

    currentAccount = resolved.account;
    currentState = resolved.state;
  } else if (params.mnemonic) {
    const resolved = resolveFromMnemonic(params.mnemonic, chainId, accountIndex, addressIndex);

    await persistWallet({
      type: "mnemonic",
      mnemonic: params.mnemonic,
      accountIndex,
      addressIndex,
    });

    currentAccount = resolved.account;
    currentState = resolved.state;
  } else {
    throw new Error("Either privateKey or mnemonic must be provided");
  }

  walletEvents.emit("wallet-changed", currentState);
  return getWalletState();
}

export async function getPersistedKeyForSubprocess(): Promise<string | null> {
  // Check persisted wallet file FIRST — activateWallet() always writes here,
  // so this reflects runtime wallet changes. Env vars are stale after activate.
  const walletPath = getWalletPath();
  if (existsSync(walletPath)) {
    try {
      const raw = await readFile(walletPath, "utf-8");
      const data = JSON.parse(raw) as PersistedWallet;
      if (data.type === "private-key") return data.privateKey;
      if (data.type === "mnemonic") {
        const account = mnemonicToAccount(data.mnemonic, {
          accountIndex: data.accountIndex ?? 0,
          addressIndex: data.addressIndex ?? 0,
        });
        const hdKey = account.getHdKey();
        if (hdKey.privateKey) {
          return `0x${Buffer.from(hdKey.privateKey).toString("hex")}`;
        }
      }
    } catch {
      /* subprocess key read failed — fall through to env vars */
    }
  }

  // Fallback to env vars for initial startup (before any activateWallet call)
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;

  if (process.env.MNEMONIC) {
    const accountIndex = Number(process.env.WALLET_ACCOUNT_INDEX ?? 0);
    const addressIndex = Number(process.env.WALLET_ADDRESS_INDEX ?? 0);
    const account = mnemonicToAccount(process.env.MNEMONIC, { accountIndex, addressIndex });
    const hdKey = account.getHdKey();
    if (hdKey.privateKey) {
      return `0x${Buffer.from(hdKey.privateKey).toString("hex")}`;
    }
  }

  return null;
}

export async function deactivateWallet(): Promise<void> {
  const walletPath = getWalletPath();
  if (existsSync(walletPath)) {
    await unlink(walletPath);
  }

  const ephemeral = resolveEphemeral(getConfiguredChainId());
  currentAccount = ephemeral.account;
  currentState = ephemeral.state;
  walletEvents.emit("wallet-changed", currentState);
}
