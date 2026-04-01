import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type TemplateDefinition,
  type TemplateId,
  getAvailableTemplates,
  getTemplateDefinition,
} from "./template-manifest.js";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT_CANDIDATES = [
  resolve(CURRENT_DIR, "../../templates/create"),
  resolve(CURRENT_DIR, "../templates/create"),
];

function resolveTemplateRoot(): string {
  const match = TEMPLATE_ROOT_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error("Unable to locate starter template assets for web3agent create");
  }
  return match;
}

export interface ResolvedTemplate {
  definition: TemplateDefinition;
  sourceDir: string;
}

export function resolveTemplate(id: TemplateId): ResolvedTemplate {
  const definition = getTemplateDefinition(id);
  if (definition.status !== "available") {
    throw new Error(`Template "${id}" is planned but not available in this slice yet.`);
  }

  return {
    definition,
    sourceDir: resolve(resolveTemplateRoot(), id),
  };
}

export function getDefaultTemplate(): TemplateDefinition {
  const [first] = getAvailableTemplates();
  if (!first) {
    throw new Error("No starter templates are available");
  }
  return first;
}
