import { type Hex, isHex } from "viem";

export function hasConfiguredOwsPassphrase(passphrase?: string): boolean {
  const resolved = passphrase ?? process.env.OWS_PASSPHRASE;
  return resolved !== undefined && resolved.trim() !== "";
}

export function normalizePrivateKey(privateKey: string): Hex | null {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!isHex(normalized, { strict: true }) || normalized.length !== 66) {
    return null;
  }
  return normalized;
}

export function requirePrivateKey(privateKey: string, errorMessage?: string): Hex {
  const normalized = normalizePrivateKey(privateKey);
  if (normalized === null) {
    throw new Error(errorMessage ?? "[wallet] Invalid 32-byte hex private key");
  }
  return normalized;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
