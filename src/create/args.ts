import { type TemplateId, isTemplateId } from "./template-manifest.js";

export interface ParsedArgs {
  targetDir: string;
  templateId?: TemplateId;
  yes: boolean;
  skipInstall: boolean;
  skipChecks: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new Error("Target directory is required");
  }

  const parsed: ParsedArgs = {
    targetDir: argv[0],
    yes: false,
    skipInstall: false,
    skipChecks: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--template") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--template requires a value");
      }
      if (!isTemplateId(value)) {
        throw new Error(`Unsupported template: ${value}`);
      }
      parsed.templateId = value;
      i += 1;
      continue;
    }

    if (arg === "--yes") {
      parsed.yes = true;
      continue;
    }

    if (arg === "--skip-install") {
      parsed.skipInstall = true;
      continue;
    }

    if (arg === "--skip-checks") {
      parsed.skipChecks = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}
