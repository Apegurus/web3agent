export type TemplateId = "vercel-ai-sdk" | "mastra" | "mcp-host";
export type TemplateStatus = "available" | "planned";

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  description: string;
  status: TemplateStatus;
}

export const TEMPLATE_MANIFEST: TemplateDefinition[] = [
  {
    id: "vercel-ai-sdk",
    label: "Vercel AI SDK",
    description: "Terminal-first starter with runtime-discovered web3agent tools.",
    status: "available",
  },
  {
    id: "mastra",
    label: "Mastra",
    description: "Mastra starter built around public web3agent operation lifecycle APIs.",
    status: "available",
  },
  {
    id: "mcp-host",
    label: "MCP Host",
    description: "Local MCP host quickstart using the public web3agent stdio server surface.",
    status: "available",
  },
];

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_MANIFEST.some((entry) => entry.id === value);
}

export function getTemplateDefinition(id: TemplateId): TemplateDefinition {
  const template = TEMPLATE_MANIFEST.find((entry) => entry.id === id);
  if (!template) {
    throw new Error(`Unknown template: ${id}`);
  }
  return template;
}

export function getAvailableTemplates(): TemplateDefinition[] {
  return TEMPLATE_MANIFEST.filter((entry) => entry.status === "available");
}
