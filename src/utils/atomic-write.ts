import { existsSync } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

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
