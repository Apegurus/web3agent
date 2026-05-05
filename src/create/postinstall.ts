import { spawn } from "node:child_process";

export interface PostinstallExecutionPlan {
  projectDir: string;
  commands: PostinstallCommand[];
}

export interface PostinstallCommand {
  command: string;
  args: string[];
  cwd: string;
}

export type CommandRunner = (command: PostinstallCommand) => Promise<void>;

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
  for (const command of plan.commands) {
    await commandRunner({
      ...command,
      cwd: command.cwd || plan.projectDir,
    });
  }
}
