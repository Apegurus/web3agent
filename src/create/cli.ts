import * as readline from "node:readline/promises";
import { parseArgs } from "./args.js";
import { createProject } from "./create.js";
import { type CommandRunner, runPostinstallCommands } from "./postinstall.js";
import { VERSION } from "../version.js";
import {
  type TemplateId,
  getAvailableTemplates,
  getTemplateDefinition,
} from "./template-manifest.js";
import { assertSupportedNodeVersion } from "./validate.js";

async function selectTemplate(): Promise<TemplateId> {
  const available = getAvailableTemplates();
  if (available.length === 1) {
    return available[0].id;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    process.stderr.write("Select a starter template:\n");
    available.forEach((template, index) => {
      process.stderr.write(`  ${index + 1}. ${template.label}\n`);
    });
    const answer = await rl.question("> ");
    const choice = Number(answer);
    const selected = available[choice - 1];
    if (!selected) {
      throw new Error("Invalid template selection");
    }
    return selected.id;
  } finally {
    rl.close();
  }
}

export interface RunCreateCliOptions {
  commandRunner?: CommandRunner;
}

function writeHelp(): void {
  const templates = getAvailableTemplates()
    .map((template) => `  - ${template.id}: ${template.label}`)
    .join("\n");

  process.stderr.write(
    `${[
      "web3agent create — Scaffold a starter project",
      "",
      "Usage:",
      "  web3agent create [target-dir] [options]",
      "",
      "Options:",
      "  --template <id>  Select a bundled starter template",
      "  --yes            Non-interactive; use the default template if omitted",
      "  --skip-install   Skip automatic npm install",
      "  --skip-checks    Skip automatic npm run check",
      "  --version        Print version",
      "  --help           Print this help",
      "",
      "If target-dir is omitted, the current directory is used.",
      "",
      "Available templates:",
      templates,
    ].join("\n")}\n`
  );
}

export async function runCreateCli(
  argv: string[],
  options: RunCreateCliOptions = {}
): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.version) {
    process.stderr.write(`web3agent ${VERSION}\n`);
    return;
  }

  if (parsed.help) {
    writeHelp();
    return;
  }

  assertSupportedNodeVersion(process.version);

  const templateId =
    parsed.templateId ??
    (parsed.yes || !process.stdin.isTTY ? getAvailableTemplates()[0]?.id : await selectTemplate());

  if (!templateId) {
    throw new Error("A template must be selected");
  }

  const template = getTemplateDefinition(templateId);
  const result = await createProject({
    ...parsed,
    templateId,
  });

  if (result.postinstall.commands.length > 0) {
    process.stderr.write("Running post-install commands...\n");
    await runPostinstallCommands(
      {
        projectDir: result.targetDir,
        commands: result.postinstall.commands,
      },
      options.commandRunner
    );
  }

  const nextSteps = result.postinstall.nextSteps.filter(
    (step) => step.startsWith("cd ") || !result.postinstall.commands.includes(step)
  );

  process.stderr.write(
    `Created ${result.targetDir} using the ${template.label} starter.\n\nNext steps:\n`
  );
  for (const step of nextSteps) {
    process.stderr.write(`  ${step}\n`);
  }
}
