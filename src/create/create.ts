import { basename, resolve } from "node:path";
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
  return basename(resolve(targetDir))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getValidatedPackageName(targetDir: string): string {
  const packageName = toPackageName(targetDir);
  if (!packageName) {
    throw new Error(
      `Could not derive a valid package name from target directory "${targetDir}". Please choose a directory name containing at least one letter or number.`
    );
  }
  return packageName;
}

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  const templateId = options.templateId ?? getDefaultTemplate().id;
  const template = resolveTemplate(templateId);
  const projectName = basename(resolve(options.targetDir));
  const packageName = getValidatedPackageName(options.targetDir);

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
      projectDir: options.targetDir,
      packageManager: "npm",
      skipInstall: options.skipInstall,
      skipChecks: options.skipChecks,
    }),
  };
}
