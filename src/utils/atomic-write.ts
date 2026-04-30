import { existsSync } from "node:fs";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const IS_POSIX = process.platform !== "win32";

async function ensureSecureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return;
  }
  if (!IS_POSIX) return;
  // Repair pre-existing dirs from < 0.5.0 installs that were created with the
  // process umask (typically 0o755). Best-effort: log and continue if chmod
  // fails (e.g., dir owned by another user).
  try {
    await chmod(dir, 0o700);
  } catch (e: unknown) {
    process.stderr.write(
      `[atomic-write] Could not tighten permissions on ${dir}: ${e instanceof Error ? e.message : String(e)}\n`
    );
  }
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await ensureSecureDir(dir);

  const tmpPath = `${filePath}.tmp`;
  const fd = await open(tmpPath, "w", 0o600);
  try {
    await fd.writeFile(JSON.stringify(data, null, 2));
    await fd.sync();
  } catch (writeError: unknown) {
    await fd.close();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort temp file cleanup
    await unlink(tmpPath).catch(() => {});
    throw writeError;
  }
  await fd.close();
  try {
    await rename(tmpPath, filePath);
  } catch (renameError: unknown) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort temp file cleanup
    await unlink(tmpPath).catch(() => {});
    throw renameError;
  }
}
