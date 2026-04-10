import { execSync } from "node:child_process";

export default function globalSetup(): void {
  execSync("pnpm build", {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
