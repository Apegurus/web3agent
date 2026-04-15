import { execSync } from "node:child_process";

export function ensureBuild(): void {
  execSync("pnpm build", {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
