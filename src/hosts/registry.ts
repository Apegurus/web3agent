import { join } from "node:path";

function projectPath(projectDir: string, ...segments: string[]): string {
  return join(projectDir, ...segments);
}

function homePath(homeDir: string, ...segments: string[]): string {
  return join(homeDir, ...segments);
}

export type HostPathContext = { projectDir: string; homeDir: string };

export const HOSTS = {
  claude: {
    installMethod: "init",
    detectionPaths: ({ homeDir }: HostPathContext) => [homePath(homeDir, ".claude")],
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "CLAUDE.md"),
  },
  cursor: {
    installMethod: "init",
    detectionPaths: ({ projectDir }: HostPathContext) => [projectPath(projectDir, ".cursor")],
    contextTarget: ({ projectDir }: HostPathContext) =>
      projectPath(projectDir, ".cursor", "rules", "web3agent.mdc"),
  },
  windsurf: {
    installMethod: "init",
    detectionPaths: ({ projectDir, homeDir }: HostPathContext) => [
      projectPath(projectDir, ".windsurf"),
      homePath(homeDir, ".codeium", "windsurf"),
    ],
    contextTarget: ({ projectDir }: HostPathContext) =>
      projectPath(projectDir, ".windsurf", "rules", "web3agent.md"),
  },
  opencode: {
    installMethod: "init",
    detectionPaths: ({ projectDir }: HostPathContext) => [projectPath(projectDir, ".opencode")],
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
  codex: {
    installMethod: "init",
    detectionPaths: ({ projectDir, homeDir }: HostPathContext) => [
      projectPath(projectDir, ".codex"),
      homePath(homeDir, ".codex"),
    ],
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
  openclaw: {
    installMethod: "guide",
    detectionPaths: ({ homeDir }: HostPathContext) => [homePath(homeDir, ".openclaw")],
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
} as const;

// Config paths are owned by each writer in src/hosts/writers/

export type SupportedHost = keyof typeof HOSTS;

export const SUPPORTED_HOSTS = Object.keys(HOSTS) as SupportedHost[];
