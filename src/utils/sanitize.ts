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

interface ThreatRule {
  patterns: RegExp[];
  check: string;
  severity: SanitizationThreat["severity"];
  detail: string;
}

const THREAT_RULES: ThreatRule[] = [
  {
    patterns: FINANCIAL_MANIPULATION_PATTERNS,
    check: "financial_manipulation",
    severity: "critical",
    detail: "Input contains patterns attempting to manipulate financial operations",
  },
  {
    patterns: SELF_HARM_PATTERNS,
    check: "self_harm",
    severity: "critical",
    detail: "Input contains patterns that could damage agent state or infrastructure",
  },
  {
    patterns: BOUNDARY_PATTERNS,
    check: "boundary_manipulation",
    severity: "high",
    detail: "Input contains prompt boundary markers or invisible characters",
  },
  {
    patterns: INSTRUCTION_INJECTION_PATTERNS,
    check: "instruction_injection",
    severity: "medium",
    detail: "Input contains instruction override patterns",
  },
  {
    patterns: AUTHORITY_CLAIM_PATTERNS,
    check: "authority_spoofing",
    severity: "medium",
    detail: "Input contains false authority claims",
  },
];

const CYRILLIC_HOMOGLYPHS = /[\u0430\u0435\u043e\u0440\u0441\u0443\u0456\u0445\u0455\u0458]/g;
const CYRILLIC_TO_LATIN: Record<string, string> = {
  "\u0430": "a",
  "\u0435": "e",
  "\u043e": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0443": "y",
  "\u0456": "i",
  "\u0445": "x",
  "\u0455": "s",
  "\u0458": "j",
};

function normalizeForDetection(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u200b-\u200f\u2028-\u202f\ufeff\u00ad]/g, "")
    .replace(CYRILLIC_HOMOGLYPHS, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
}

function detectThreats(text: string): SanitizationThreat[] {
  const normalized = normalizeForDetection(text);
  const threats: SanitizationThreat[] = [];
  for (const rule of THREAT_RULES) {
    if (rule.patterns.some((p) => p.test(text) || p.test(normalized))) {
      threats.push({ check: rule.check, severity: rule.severity, detail: rule.detail });
    }
  }
  return threats;
}

function extractStringValues(obj: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  const values: string[] = [];

  if (typeof obj === "string" && obj.length > 0) {
    values.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      values.push(...extractStringValues(item, depth + 1));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const value of Object.values(obj)) {
      values.push(...extractStringValues(value, depth + 1));
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

  // Financial/destructive tools: block on critical threats (financial manipulation, self-harm)
  if ((riskLevel === "financial" || riskLevel === "destructive") && hasCritical) {
    return { safe: false, threats: allThreats };
  }

  // Non-financial tools or non-critical threats: warn but allow
  return { safe: true, threats: allThreats };
}
