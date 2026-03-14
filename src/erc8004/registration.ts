export const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

export interface RegistrationParams {
  name: string;
  description: string;
  mcpEndpoint?: string;
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  active?: boolean;
}

export function buildRegistrationJson(params: RegistrationParams): object {
  const json: Record<string, unknown> = {
    type: REGISTRATION_TYPE,
    name: params.name,
    description: params.description,
  };
  if (params.mcpEndpoint) {
    json.services = [
      { name: "mcp", endpoint: params.mcpEndpoint, version: "1.0" },
      ...(params.services ?? []),
    ];
  } else if (params.services?.length) {
    json.services = params.services;
  }
  if (typeof params.active === "boolean") {
    json.active = params.active;
  }
  return json;
}

export function validateRegistrationJson(json: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof json !== "object" || json === null) {
    return { valid: false, errors: ["Registration JSON must be an object"] };
  }
  const obj = json as Record<string, unknown>;
  if (obj.type !== REGISTRATION_TYPE) {
    errors.push(
      `Missing or invalid "type" field. Expected: "${REGISTRATION_TYPE}", got: "${String(obj.type ?? "")}"`
    );
  }
  if (!obj.name || typeof obj.name !== "string" || obj.name.trim() === "") {
    errors.push('Missing or empty "name" field');
  }
  return { valid: errors.length === 0, errors };
}
