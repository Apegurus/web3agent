import { type Hex, isHex } from "viem";

export const OWS_PASSPHRASE_MIN_LENGTH = 12;
export const OWS_PASSPHRASE_RECOMMENDED_LENGTH = 16;

export interface OwsPassphraseStrengthAssessment {
  errors: string[];
  warnings: string[];
}

const COMMON_WEAK_PASSPHRASE_PATTERNS = ["password", "123456", "qwerty", "letmein"];

export function hasConfiguredOwsPassphrase(passphrase?: string): boolean {
  const resolved = passphrase ?? process.env.OWS_PASSPHRASE;
  return resolved !== undefined && resolved.trim() !== "";
}

export function assessOwsPassphraseStrength(passphrase: string): OwsPassphraseStrengthAssessment {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (passphrase.length < OWS_PASSPHRASE_MIN_LENGTH) {
    errors.push(
      `OWS_PASSPHRASE must be at least ${OWS_PASSPHRASE_MIN_LENGTH} characters for OWS encrypted storage`
    );
  } else if (passphrase.length < OWS_PASSPHRASE_RECOMMENDED_LENGTH) {
    warnings.push(
      `OWS_PASSPHRASE is shorter than the recommended ${OWS_PASSPHRASE_RECOMMENDED_LENGTH} characters`
    );
  }

  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasDigit = /\d/.test(passphrase);
  const hasSymbol = /[^a-zA-Z0-9]/.test(passphrase);
  const characterClassCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (characterClassCount < 2) {
    warnings.push(
      "OWS_PASSPHRASE uses only one character class; mix words, case, digits, or symbols"
    );
  }

  const normalized = passphrase.toLowerCase();
  if (COMMON_WEAK_PASSPHRASE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    warnings.push("OWS_PASSPHRASE contains a common weak pattern");
  }

  return { errors, warnings };
}

export function assertOwsPassphraseMeetsMinimum(passphrase: string): void {
  const assessment = assessOwsPassphraseStrength(passphrase);
  const firstError = assessment.errors[0];
  if (firstError) {
    throw new Error(`${firstError}. Use a longer passphrase before creating OWS wallet material.`);
  }
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
