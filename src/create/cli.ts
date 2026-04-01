import * as readline from "node:readline/promises";
import { parseArgs } from "./args.js";
import { createProject } from "./create.js";
import { type CommandRunner, runPostinstallCommands } from "./postinstall.js";
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

export async function runCreateCli(
  argv: string[],
  options: RunCreateCliOptions = {}
): Promise<void> {
  assertSupportedNodeVersion(process.version);

  const parsed = parseArgs(argv);
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
