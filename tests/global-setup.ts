import { execSync } from "node:child_process";
import { withPackLock } from "./e2e/pack-mutex.js";

// Both `pnpm build` and `pnpm pack` (whose prepack hook re-runs the build)
// invoke tsup with `clean: true`, which deletes `dist/` before recompiling.
// Two parallel callers — even one build + one pack — race on that directory
// and produce ENOENT. The pack-mutex serializes both operations on the same
// lock since they share the dist/ contention domain.
export function ensureBuild(): void {
  withPackLock(() => {
    execSync("pnpm build", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  });
}
