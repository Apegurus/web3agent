import { buildDoctorIssues } from "../../config/health.js";
import { writeJson } from "../output.js";
import { withCliRuntime } from "../runtime.js";

function printHelp(): void {
  process.stderr.write(
    `${[
      "web3agent doctor — Capability and backend diagnostics",
      "",
      "Usage:",
      "  web3agent doctor --json",
    ].join("\n")}\n`
  );
}

export async function runDoctorCommand(args: string[]): Promise<void> {
  const isJsonMode = args.includes("--json");

  if (!isJsonMode) {
    printHelp();
    return;
  }

  await withCliRuntime(
    async (runtime) => {
      const health = runtime.getHealth();
      writeJson({
        ok: true,
        data: {
          health,
          issues: buildDoctorIssues(health),
        },
      });
    },
    { json: isJsonMode }
  );
}
