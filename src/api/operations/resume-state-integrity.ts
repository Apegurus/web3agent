import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { tryGetConfig } from "../../config/env.js";
import { canonicalJson } from "../../utils/canonical-json.js";
import { Web3AgentError } from "../errors.js";
import type { OperationResumeState, PreparedOperation } from "../types.js";
import { loadResumeStateKeys } from "./resume-state-key-store.js";

const INTEGRITY_VERSION = "v1";
const INTEGRITY_TAG_PATTERN = /^v1\.([0-9a-f]{16})\.([0-9a-f]{64})$/;

function immutableState(state: Record<string, unknown>): Record<string, unknown> {
  return normalizeObject(
    Object.fromEntries(
      Object.entries(state).filter(([key]) => key !== "actionResults" && key !== "integrity")
    )
  );
}

function normalizeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, normalizeValue(entry)])
  );
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isRecord(value)) return normalizeObject(value);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function integrityPayload(resumeState: OperationResumeState): string {
  return canonicalJson({
    integration: resumeState.integration,
    kind: resumeState.kind,
    state: immutableState(resumeState.state),
    version: resumeState.version,
  });
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function configuredSecrets(): string | undefined {
  const config = tryGetConfig();
  return config === undefined
    ? process.env.WEB3AGENT_RESUME_STATE_SECRETS
    : config.resumeStateSecrets;
}

function keyRing(): readonly Buffer[] {
  return loadResumeStateKeys(configuredSecrets());
}

function createIntegrityTag(resumeState: OperationResumeState, key: Buffer): string {
  const mac = createHmac("sha256", key).update(integrityPayload(resumeState)).digest("hex");
  return `${INTEGRITY_VERSION}.${keyId(key)}.${mac}`;
}

export function authenticateResumeState(resumeState: OperationResumeState): OperationResumeState {
  const [activeKey] = keyRing();
  if (!activeKey)
    throw new Web3AgentError({ code: "RESUME_STATE_KEY_INVALID", message: "No active key" });
  return {
    ...resumeState,
    state: { ...resumeState.state, integrity: createIntegrityTag(resumeState, activeKey) },
  };
}

export function authenticatePreparedOperation(operation: PreparedOperation): PreparedOperation {
  return {
    ...operation,
    resumeState: authenticateResumeState(operation.resumeState),
  };
}

export function assertResumeStateIntegrity(resumeState: OperationResumeState): void {
  const integrity = resumeState.state.integrity;
  if (typeof integrity !== "string") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message:
        "Prepared operation predates authenticated resume states; prepare the operation again",
    });
  }
  const match = INTEGRITY_TAG_PATTERN.exec(integrity);
  if (!match) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "Prepared operation resume state has an invalid integrity tag",
    });
  }
  const [, observedKeyId, observedMac] = match;
  const key = keyRing().find((candidate) => keyId(candidate) === observedKeyId);
  if (!key || observedMac === undefined) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "Prepared operation resume state was signed by an unavailable key; prepare again",
    });
  }
  const expected = Buffer.from(createIntegrityTag(resumeState, key).split(".")[2] ?? "", "hex");
  const observed = Buffer.from(observedMac, "hex");
  if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "Prepared operation resume state failed integrity verification",
    });
  }
}
