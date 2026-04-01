import { basename } from "node:path";
import { VERSION } from "../version.js";
import { renderTemplate } from "./render.js";
import type { TemplateDefinition, TemplateId } from "./template-manifest.js";
import { getDefaultTemplate, resolveTemplate } from "./templates.js";
import { buildPostinstallPlan } from "./validate.js";

export interface CreateProjectOptions {
  targetDir: string;
  templateId?: TemplateId;
  yes: boolean;
  skipInstall: boolean;
  skipChecks: boolean;
}

export interface CreateProjectResult {
  targetDir: string;
  template: TemplateDefinition;
  postinstall: ReturnType<typeof buildPostinstallPlan>;
}

function toPackageName(targetDir: string): string {
  return basename(targetDir)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  const templateId = options.templateId ?? getDefaultTemplate().id;
  const template = resolveTemplate(templateId);
  const projectName = basename(options.targetDir);
  const packageName = toPackageName(options.targetDir);

  await renderTemplate({
    sourceDir: template.sourceDir,
    targetDir: options.targetDir,
    tokens: {
      PROJECT_NAME: projectName,
      PACKAGE_NAME: packageName,
      WEB3AGENT_VERSION: VERSION,
    },
  });

  return {
    targetDir: options.targetDir,
    template: template.definition,
    postinstall: buildPostinstallPlan({
      projectDir: projectName,
      packageManager: "npm",
      skipInstall: options.skipInstall,
      skipChecks: options.skipChecks,
    }),
  };
}
