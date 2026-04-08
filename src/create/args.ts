import { type TemplateId, isTemplateId } from "./template-manifest.js";

export interface ParsedArgs {
  targetDir: string;
  templateId?: TemplateId;
  yes: boolean;
  skipInstall: boolean;
  skipChecks: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    targetDir: ".",
    yes: false,
    skipInstall: false,
    skipChecks: false,
    help: false,
    version: false,
  };
  let hasExplicitTarget = false;

  for (let i = 0; i < argv.length; i++) {
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

    if (arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (arg === "--version") {
      parsed.version = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      if (hasExplicitTarget) {
        throw new Error("Only one target directory may be provided");
      }
      parsed.targetDir = arg;
      hasExplicitTarget = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}
