import { execSync } from "node:child_process";

export default function globalSetup(): void {
  execSync("pnpm build", {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
  });
}
