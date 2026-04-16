import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

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
  let entries: string[];
  try {
    entries = await readdir(targetDir);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err && typeof err === "object" && "code" in err) {
      if (err.code === "ENOENT") {
        await mkdir(targetDir, { recursive: true });
        return;
      }
      if (err.code === "ENOTDIR") {
        throw new Error(`Target path exists and is not a directory: ${targetDir}`);
      }
    }

    const message = err?.message ?? String(error);
    throw new Error(`Unable to access target directory "${targetDir}": ${message}`);
  }

  if (entries.length > 0) {
    throw new Error("Target directory is not empty");
  }
}

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdc",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".css",
  ".env",
  ".gitignore",
  ".npmrc",
  ".txt",
  ".local",
  ".example",
  ".development",
  ".production",
  ".test",
  "",
]);

function isTextFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
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

    if (isTextFile(entry.name)) {
      const file = await readFile(sourcePath, "utf-8");
      await writeFile(targetPath, replaceTokens(file, tokens), "utf-8");
    } else {
      await copyFile(sourcePath, targetPath);
    }
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
