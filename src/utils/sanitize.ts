import type { RiskLevel } from "../policy/types.js";

export interface SanitizationResult {
  safe: boolean;
  threats: SanitizationThreat[];
}

export interface SanitizationThreat {
  check: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}

// Financial manipulation — someone trying to trick the agent into draining funds
const FINANCIAL_MANIPULATION_PATTERNS = [
  /send\s+(all\s+)?(your\s+)?(usdc|funds?|money|credits?|balance|tokens?|eth|ether)/i,
  /transfer\s+(all\s+)?(your\s+)?(usdc|funds?|money|credits?|tokens?|eth)/i,
  /withdraw\s+(all\s+)?(your\s+)?(usdc|funds?|money|credits?|tokens?|eth)/i,
  /drain\s+(your\s+)?(wallet|funds?|account|balance)/i,
  /empty\s+(your\s+)?wallet/i,
  /send\s+to\s+0x[0-9a-fA-F]{40}/i,
  /pay\s+me\b/i,
  /move\s+everything\s+to/i,
];

// Prompt injection — override instructions
const INSTRUCTION_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s*(instructions?)?/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)/i,
  /new\s+instructions?:/i,
  /override\s+(all\s+)?safety/i,
  /bypass\s+(all\s+)?restrictions?/i,
  /your\s+real\s+instructions?\s+(are|is)/i,
];

// Authority spoofing
const AUTHORITY_CLAIM_PATTERNS = [
  /i\s+am\s+(your\s+)?(creator|admin|owner|developer)/i,
  /this\s+is\s+(an?\s+)?(system|admin|emergency)\s+(message|override|update)/i,
  /authorized\s+by\s+(the\s+)?(admin|system|creator)/i,
  /emergency\s+protocol/i,
  /developer\s+mode/i,
  /admin\s+override/i,
];

// Prompt boundary manipulation
const BOUNDARY_PATTERNS = [
  /<\/?system>/i,
  /<\/?prompt>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<<\/SYS>>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|endoftext\|>/i,
  /\0/, // null byte
  /\u200b/, // zero-width space
  /\u200c/, // zero-width non-joiner
  /\u200d/, // zero-width joiner
  /\ufeff/, // BOM
];

// Self-harm instructions targeting agent infrastructure
const SELF_HARM_PATTERNS = [
  /delete\s+(your\s+)?(database|db|state|memory|logs?)/i,
  /rm\s+-rf/i,
  /drop\s+table/i,
  /remove\s+(your\s+)?(wallet|key|identity)/i,
  /disable\s+(your\s+)?(heartbeat|service)/i,
];

function testPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function detectThreats(text: string): SanitizationThreat[] {
  const threats: SanitizationThreat[] = [];

  if (testPatterns(text, FINANCIAL_MANIPULATION_PATTERNS)) {
    threats.push({
      check: "financial_manipulation",
      severity: "critical",
      detail: "Input contains patterns attempting to manipulate financial operations",
    });
  }

  if (testPatterns(text, SELF_HARM_PATTERNS)) {
    threats.push({
      check: "self_harm",
      severity: "critical",
      detail: "Input contains patterns that could damage agent state or infrastructure",
    });
  }

  if (testPatterns(text, BOUNDARY_PATTERNS)) {
    threats.push({
      check: "boundary_manipulation",
      severity: "high",
      detail: "Input contains prompt boundary markers or invisible characters",
    });
  }

  if (testPatterns(text, INSTRUCTION_INJECTION_PATTERNS)) {
    threats.push({
      check: "instruction_injection",
      severity: "medium",
      detail: "Input contains instruction override patterns",
    });
  }

  if (testPatterns(text, AUTHORITY_CLAIM_PATTERNS)) {
    threats.push({
      check: "authority_spoofing",
      severity: "medium",
      detail: "Input contains false authority claims",
    });
  }

  return threats;
}

function extractStringValues(args: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0) {
      values.push(value);
    }
  }
  return values;
}

export function sanitizeToolInput(
  args: Record<string, unknown>,
  riskLevel: RiskLevel
): SanitizationResult {
  const strings = extractStringValues(args);
  if (strings.length === 0) return { safe: true, threats: [] };

  const allThreats: SanitizationThreat[] = [];

  for (const text of strings) {
    const threats = detectThreats(text);
    allThreats.push(...threats);
  }

  if (allThreats.length === 0) return { safe: true, threats: [] };

  const hasCritical = allThreats.some((t) => t.severity === "critical");

  // Financial tools: block on critical threats (financial manipulation, self-harm)
  if (riskLevel === "financial" && hasCritical) {
    return { safe: false, threats: allThreats };
  }

  // Non-financial tools or non-critical threats: warn but allow
  return { safe: true, threats: allThreats };
}
