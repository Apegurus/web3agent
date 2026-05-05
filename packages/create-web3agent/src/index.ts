import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunCreateCliOptions } from "web3agent/create";

export type { CommandRunner, RunCreateCliOptions } from "web3agent/create";

export async function runCreateCli(argv: string[], options?: RunCreateCliOptions): Promise<void> {
  // Keep this as a runtime-only import. A static import lets tsup inline
  // web3agent/create into this compatibility wrapper, which breaks template
  // asset discovery because import.meta.url then points at create-web3agent.
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string
  ) => Promise<typeof import("web3agent/create")>;
  const module = await dynamicImport("web3agent/create");
  return module.runCreateCli(argv, options);
}

const isMain = (() => {
  try {
    const here = realpathSync(fileURLToPath(import.meta.url));
    const invoked = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
    return invoked !== undefined && here === invoked;
  } catch {
    return false;
  }
})();

if (isMain) {
  void runCreateCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
