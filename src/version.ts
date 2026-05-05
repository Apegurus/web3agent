import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

declare const __VERSION__: string;

function readPackageVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(
      readFileSync(resolve(currentDir, "../package.json"), "utf-8")
    ) as { version?: string };

    return packageJson.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

export const VERSION: string =
  typeof __VERSION__ !== "undefined" ? __VERSION__ : readPackageVersion();
