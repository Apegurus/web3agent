import type { CcxtAccountSummary } from "../api/types.js";
import type { CcxtAccountConfig, CcxtAccountRegistry } from "./types.js";

export function accountHasCredentials(account: CcxtAccountConfig): boolean {
  return Boolean(account.privateKey) || (Boolean(account.apiKey) && Boolean(account.secret));
}

export function getAccountByName(
  registry: CcxtAccountRegistry,
  accountName: string
): CcxtAccountConfig | undefined {
  return registry.accounts.find((account) => account.name === accountName);
}

export function listAccountSummaries(registry: CcxtAccountRegistry): CcxtAccountSummary[] {
  return registry.accounts.map((account) => ({
    name: account.name,
    exchangeId: account.exchangeId,
    defaultType: account.defaultType,
    sandbox: account.sandbox ?? false,
  }));
}

export function resolveExchangeIdFromAccount(
  registry: CcxtAccountRegistry,
  accountName: string
): string | undefined {
  return getAccountByName(registry, accountName)?.exchangeId;
}
