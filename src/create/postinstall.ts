import { spawn } from "node:child_process";

export interface PostinstallExecutionPlan {
  projectDir: string;
  commands: string[];
}

export interface PostinstallCommand {
  command: string;
  args: string[];
  cwd: string;
}

export type CommandRunner = (command: PostinstallCommand) => Promise<void>;

function parseCommand(commandLine: string): PostinstallCommand {
  const [command, ...args] = commandLine.split(" ").filter(Boolean);
  if (!command) {
    throw new Error("Post-install command cannot be empty");
  }

  return {
    command,
    args,
    cwd: "",
  };
}

async function defaultCommandRunner(command: PostinstallCommand): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Post-install command failed: ${command.command} ${command.args.join(" ")} (exit ${code ?? "unknown"})`
        )
      );
    });
  });
}

export async function runPostinstallCommands(
  plan: PostinstallExecutionPlan,
  commandRunner: CommandRunner = defaultCommandRunner
): Promise<void> {
  for (const commandLine of plan.commands) {
    const command = parseCommand(commandLine);
    await commandRunner({
      ...command,
      cwd: plan.projectDir,
    });
  }
}
