export interface PostinstallPlanInput {
  projectDir: string;
  packageManager: "npm";
  skipInstall: boolean;
  skipChecks: boolean;
}

export interface PostinstallPlan {
  commands: string[];
  nextSteps: string[];
}

export function assertSupportedNodeVersion(version: string): void {
  const match = /^v(\d+)\./.exec(version);
  const major = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(major) || major < 22) {
    throw new Error("Node.js 22 or newer is required");
  }
}

export function buildPostinstallPlan(input: PostinstallPlanInput): PostinstallPlan {
  const commands: string[] = [];
  const nextSteps = input.projectDir === "." ? [] : [`cd ${input.projectDir}`];

  if (!input.skipInstall) {
    commands.push(`${input.packageManager} install`);
    nextSteps.push(`${input.packageManager} install`);
  }

  if (!input.skipChecks && !input.skipInstall) {
    commands.push(`${input.packageManager} run check`);
    nextSteps.push(`${input.packageManager} run check`);
  } else if (!input.skipChecks) {
    nextSteps.push(`${input.packageManager} install`);
    nextSteps.push(`${input.packageManager} run check`);
  }

  nextSteps.push(`${input.packageManager} run dev`);

  return { commands, nextSteps };
}
