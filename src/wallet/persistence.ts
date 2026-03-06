import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Account } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
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

export function getWalletState(): WalletState {
  return { ...currentState };
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
    /* corrupted wallet file — fall through to ephemeral (security: do not leak error details) */
  }
  return null;
}

export async function initializeWallet(config: {
  chainId: number;
  accountIndex: number;
  addressIndex: number;
}): Promise<void> {
  const { chainId, accountIndex, addressIndex } = config;

  const envKey = process.env.PRIVATE_KEY;
  if (envKey) {
    const resolved = resolveFromPrivateKey(envKey, chainId);
    currentAccount = resolved.account;
    currentState = resolved.state;
    walletEvents.emit("wallet-changed", currentState);
    return;
  }

  const envMnemonic = process.env.MNEMONIC;
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

async function persistWallet(data: PersistedWallet): Promise<void> {
  await ensureWalletDir();
  await writeFile(getWalletPath(), JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

export async function activateWallet(params: {
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
  addressIndex?: number;
}): Promise<WalletState> {
  const chainId = currentState.chainId;
  const accountIndex = params.accountIndex ?? 0;
  const addressIndex = params.addressIndex ?? 0;

  if (params.privateKey) {
    const resolved = resolveFromPrivateKey(params.privateKey, chainId);
    currentAccount = resolved.account;
    currentState = resolved.state;

    await persistWallet({
      type: "private-key",
      privateKey: params.privateKey,
      address: resolved.account.address,
    });
  } else if (params.mnemonic) {
    const resolved = resolveFromMnemonic(params.mnemonic, chainId, accountIndex, addressIndex);
    currentAccount = resolved.account;
    currentState = resolved.state;

    await persistWallet({
      type: "mnemonic",
      mnemonic: params.mnemonic,
      accountIndex,
      addressIndex,
    });
  } else {
    throw new Error("Either privateKey or mnemonic must be provided");
  }

  walletEvents.emit("wallet-changed", currentState);
  return getWalletState();
}

export async function deactivateWallet(): Promise<void> {
  const walletPath = getWalletPath();
  if (existsSync(walletPath)) {
    await unlink(walletPath);
  }

  const ephemeral = resolveEphemeral(currentState.chainId);
  currentAccount = ephemeral.account;
  currentState = ephemeral.state;
  walletEvents.emit("wallet-changed", currentState);
}
