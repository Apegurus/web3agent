import { existsSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.tmp`;
  const fd = await open(tmpPath, "w", 0o600);
  try {
    await fd.writeFile(JSON.stringify(data, null, 2));
    await fd.sync();
  } finally {
    await fd.close();
  }
  await rename(tmpPath, filePath);
}
