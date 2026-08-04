import { parseArgs } from "node:util";

const optionDefinitions = {
  base: { type: "string" },
  evidence: { type: "string" },
  head: { type: "string" },
  json: { type: "string" },
  mode: { type: "string" },
  phase: { type: "string" },
  plan: { type: "string" },
  "self-test": { type: "boolean" },
  "self-test-scope": { type: "boolean" },
};

export function parseEvidenceCliArgs(args) {
  const { tokens, values } = parseArgs({
    allowPositionals: false,
    args,
    options: optionDefinitions,
    strict: true,
    tokens: true,
  });
  const seen = new Set();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
  }

  const mode = values.mode ?? "evidence";
  if (mode !== "evidence" && mode !== "scope") throw new Error(`Invalid audit mode: ${mode}`);
  const phase = values.phase ?? "current";
  if (phase !== "current" && phase !== "final") throw new Error(`Invalid audit phase: ${phase}`);
  for (const [name, value] of [
    ["base", values.base],
    ["head", values.head],
  ]) {
    if (value?.startsWith("-")) throw new Error(`Invalid Git ref for --${name}: ${value}`);
  }

  return {
    base: values.base,
    evidence: values.evidence,
    head: values.head,
    json: values.json,
    mode,
    phase,
    plan: values.plan,
    selfTest: values["self-test"] ?? false,
    selfTestScope: values["self-test-scope"] ?? false,
  };
}
