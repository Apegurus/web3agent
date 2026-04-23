import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface PostinstallCommand {
  command: string;
  args: string[];
  cwd: string;
}

export type CommandRunner = (command: PostinstallCommand) => Promise<void>;

export interface RunCreateCliOptions {
  commandRunner?: CommandRunner;
}

async function loadCreateModule(): Promise<{
  runCreateCli: (argv: string[], options?: RunCreateCliOptions) => Promise<void>;
}> {
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string
  ) => Promise<{
    runCreateCli: (argv: string[], options?: RunCreateCliOptions) => Promise<void>;
  }>;

  return dynamicImport("web3agent/create");
}

export async function runCreateCli(argv: string[], options?: RunCreateCliOptions): Promise<void> {
  const module = await loadCreateModule();
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
