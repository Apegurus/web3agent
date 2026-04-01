import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RenderTemplateOptions {
  sourceDir: string;
  targetDir: string;
  tokens: Record<string, string>;
}

function replaceTokens(input: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (output, [key, value]) => output.replaceAll(`__${key}__`, value),
    input
  );
}

async function assertEmptyOrMissingDirectory(targetDir: string): Promise<void> {
  try {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error("Target directory is not empty");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Target directory is not empty") {
      throw error;
    }
    await mkdir(targetDir, { recursive: true });
  }
}

async function copyRecursive(
  sourceDir: string,
  targetDir: string,
  tokens: Record<string, string>
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(sourcePath, targetPath, tokens);
      continue;
    }

    const file = await readFile(sourcePath, "utf-8");
    await writeFile(targetPath, replaceTokens(file, tokens), "utf-8");
  }
}

export async function renderTemplate(options: RenderTemplateOptions): Promise<void> {
  const sourceStats = await stat(options.sourceDir);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Template source is not a directory: ${options.sourceDir}`);
  }

  await assertEmptyOrMissingDirectory(options.targetDir);
  await copyRecursive(options.sourceDir, options.targetDir, options.tokens);
}
