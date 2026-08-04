import { createHash, randomBytes } from "node:crypto";
import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { Web3AgentError } from "../errors.js";

const KEY_BYTES = 32;
const PUBLICATION_RETRY_COUNT = 50;
const PUBLICATION_RETRY_DELAY_MS = 10;
const publicationWaitBuffer = new Int32Array(new SharedArrayBuffer(4));
const keyRings = new Map<string, readonly Buffer[]>();

class KeyPublicationPendingError extends Error {}

export function loadResumeStateKeys(secrets: string | undefined): readonly Buffer[] {
  if (secrets !== undefined && secrets.trim() !== "") {
    const cacheKey = `env:${createHash("sha256").update(secrets).digest("hex")}`;
    const cached = keyRings.get(cacheKey);
    if (cached) return cached;
    const entries = secrets.split(",").map((entry) => entry.trim());
    if (entries.some((entry) => entry.length < 32)) {
      throw new Web3AgentError({
        code: "RESUME_STATE_KEY_INVALID",
        message: "WEB3AGENT_RESUME_STATE_SECRETS entries must each contain at least 32 characters",
      });
    }
    const keys = entries.map((entry) => createHash("sha256").update(entry).digest());
    keyRings.set(cacheKey, keys);
    return keys;
  }

  if (process.platform === "win32") {
    throw new Web3AgentError({
      code: "RESUME_STATE_KEY_UNAVAILABLE",
      message: "WEB3AGENT_RESUME_STATE_SECRETS is required on Windows",
    });
  }
  const keyPath = join(homedir(), ".web3agent", "resume-state.key");
  const cached = keyRings.get(keyPath);
  if (cached) return cached;
  const key = readOrCreateKey(keyPath);
  const keys = [key] as const;
  keyRings.set(keyPath, keys);
  return keys;
}

function readOrCreateKey(keyPath: string): Buffer {
  const directory = join(homedir(), ".web3agent");
  try {
    ensureSecureKeyDirectory(directory);
    return readPublishedKey(keyPath);
  } catch (error: unknown) {
    if (!isNodeError(error, "ENOENT")) throw keyError(error);
  }

  const generated = randomBytes(KEY_BYTES);
  const temporaryPath = `${keyPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor: number | undefined;
  let result: Buffer | undefined;
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, generated);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporaryPath, keyPath);
      result = generated;
    } catch (error: unknown) {
      if (isNodeError(error, "EEXIST")) result = readPublishedKey(keyPath);
      else throw error;
    }
  } catch (error: unknown) {
    operationError = error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch (error: unknown) {
      if (!isNodeError(error, "ENOENT")) cleanupError = error;
    }
  }
  if (operationError !== undefined) throw keyError(operationError);
  if (cleanupError !== undefined) throw keyError(cleanupError);
  if (result === undefined) throw keyError(new Error("Resume-state key creation produced no key"));
  return result;
}

function ensureSecureKeyDirectory(directory: string): void {
  try {
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory()) throw new Error("Resume-state key parent is not a directory");
    requireSecureOwnership(metadata.uid, metadata.mode, "Resume-state key directory");
  } catch (error: unknown) {
    if (!isNodeError(error, "ENOENT")) throw error;
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (mkdirError: unknown) {
      if (!isNodeError(mkdirError, "EEXIST")) throw mkdirError;
    }
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory()) throw new Error("Resume-state key parent is not a directory");
    requireSecureOwnership(metadata.uid, metadata.mode, "Resume-state key directory");
  }
}

function readPublishedKey(keyPath: string): Buffer {
  for (let attempt = 0; attempt < PUBLICATION_RETRY_COUNT; attempt += 1) {
    try {
      return readSecureKey(keyPath);
    } catch (error: unknown) {
      if (!(error instanceof KeyPublicationPendingError)) throw error;
      Atomics.wait(publicationWaitBuffer, 0, 0, PUBLICATION_RETRY_DELAY_MS);
    }
  }
  recoverOrphanedPublication(keyPath);
  return readSecureKey(keyPath);
}

function recoverOrphanedPublication(keyPath: string): void {
  const keyMetadata = lstatSync(keyPath);
  const directory = dirname(keyPath);
  const prefix = `${basename(keyPath)}.`;
  for (const entry of readdirSync(directory)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".tmp")) continue;
    const temporaryPath = join(directory, entry);
    try {
      const metadata = lstatSync(temporaryPath);
      if (
        metadata.isFile() &&
        metadata.dev === keyMetadata.dev &&
        metadata.ino === keyMetadata.ino
      ) {
        unlinkSync(temporaryPath);
        return;
      }
    } catch (error: unknown) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
  }
  throw new Error("Resume-state key publication did not complete");
}

function readSecureKey(keyPath: string): Buffer {
  const descriptor = openSync(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (metadata.isFile() && metadata.nlink === 2) throw new KeyPublicationPendingError();
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new Error("Resume-state key must be a regular file with one link");
    }
    requireSecureOwnership(metadata.uid, metadata.mode, "Resume-state key");
    return validateKey(readFileSync(descriptor), keyPath);
  } finally {
    closeSync(descriptor);
  }
}

function requireSecureOwnership(uid: number, mode: number, label: string): void {
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && uid !== currentUid) throw new Error(`${label} has another owner`);
  if ((mode & 0o077) !== 0) throw new Error(`${label} is accessible by group or other users`);
}

function validateKey(key: Buffer, keyPath: string): Buffer {
  if (key.length !== KEY_BYTES) {
    throw new Web3AgentError({
      code: "RESUME_STATE_KEY_INVALID",
      message: `Resume-state key at ${keyPath} must contain exactly ${KEY_BYTES} bytes`,
    });
  }
  return key;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function keyError(error: unknown): Web3AgentError {
  return Web3AgentError.fromUnknown(
    "RESUME_STATE_KEY_UNAVAILABLE",
    error,
    "Unable to load the resume-state integrity key"
  );
}
