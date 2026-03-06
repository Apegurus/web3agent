import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  english,
  generateMnemonic,
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { formatToolError, formatToolResponse } from "../../types/tools.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";

export async function walletGenerate(): Promise<CallToolResult> {
  try {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    return formatToolResponse({
      address: account.address,
      privateKey: key,
      warning: "Private key returned once. Never stored. Save it now.",
    });
  } catch (err) {
    return formatToolError(
      "WALLET_GENERATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletGenerateMnemonic(): Promise<CallToolResult> {
  try {
    const mnemonic = generateMnemonic(english);
    const account = mnemonicToAccount(mnemonic);
    return formatToolResponse({
      mnemonic,
      firstAddress: account.address,
      derivationPath: "m/44'/60'/0'/0/0",
      warning: "Mnemonic returned once. Never stored. Save it now.",
    });
  } catch (err) {
    return formatToolError(
      "MNEMONIC_GENERATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletFromMnemonic(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const mnemonic = params.mnemonic;
    if (typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "mnemonic is required");
    }

    const accountIndex = typeof params.accountIndex === "number" ? params.accountIndex : 0;
    const addressIndex = typeof params.addressIndex === "number" ? params.addressIndex : 0;

    const account = mnemonicToAccount(mnemonic, {
      accountIndex,
      addressIndex,
    });

    return formatToolResponse({
      address: account.address,
      derivationPath: `m/44'/60'/${accountIndex}'/0/${addressIndex}`,
    });
  } catch (err) {
    return formatToolError(
      "MNEMONIC_RESOLVE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function walletDeriveAddresses(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    const mnemonic = params.mnemonic;
    if (typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
      return formatToolError("INVALID_PARAMS", "mnemonic is required");
    }

    const count = typeof params.count === "number" ? params.count : 5;
    if (count < 1 || count > 20) {
      return formatToolError("INVALID_PARAMS", "count must be between 1 and 20");
    }

    const addresses = Array.from({ length: count }, (_, i) => {
      const account = mnemonicToAccount(mnemonic, { addressIndex: i });
      return {
        index: i,
        address: account.address,
        derivationPath: `m/44'/60'/0'/0/${i}`,
      };
    });

    return formatToolResponse(addresses);
  } catch (err) {
    return formatToolError("DERIVE_FAILED", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function walletGetActive(): Promise<CallToolResult> {
  try {
    const state = getWalletState();
    return formatToolResponse({
      address: state.address ?? getActiveAccount().address,
      chainId: state.chainId,
      mode: state.mode,
    });
  } catch (err) {
    return formatToolError(
      "WALLET_STATE_FAILED",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}
