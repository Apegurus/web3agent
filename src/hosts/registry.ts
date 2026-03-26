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
    configTargets: ({ projectDir, homeDir }: HostPathContext) => ({
      preferred: projectPath(projectDir, ".mcp.json"),
      fallback: homePath(homeDir, ".claude", "mcp.json"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "CLAUDE.md"),
  },
  cursor: {
    installMethod: "init",
    detectionPaths: ({ projectDir }: HostPathContext) => [projectPath(projectDir, ".cursor")],
    configTargets: ({ projectDir }: HostPathContext) => ({
      preferred: projectPath(projectDir, ".cursor", "mcp.json"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) =>
      projectPath(projectDir, ".cursor", "rules", "web3agent.mdc"),
  },
  windsurf: {
    installMethod: "init",
    detectionPaths: ({ projectDir, homeDir }: HostPathContext) => [
      projectPath(projectDir, ".windsurf"),
      homePath(homeDir, ".codeium", "windsurf"),
    ],
    configTargets: ({ homeDir }: HostPathContext) => ({
      preferred: homePath(homeDir, ".codeium", "windsurf", "mcp_config.json"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) =>
      projectPath(projectDir, ".windsurf", "rules", "web3agent.md"),
  },
  opencode: {
    installMethod: "init",
    detectionPaths: ({ projectDir }: HostPathContext) => [projectPath(projectDir, ".opencode")],
    configTargets: ({ projectDir }: HostPathContext) => ({
      preferred: projectPath(projectDir, ".opencode", "config.json"),
      fallback: projectPath(projectDir, "opencode.json"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
  codex: {
    installMethod: "init",
    detectionPaths: ({ projectDir, homeDir }: HostPathContext) => [
      projectPath(projectDir, ".codex"),
      homePath(homeDir, ".codex"),
    ],
    configTargets: ({ projectDir, homeDir }: HostPathContext) => ({
      preferred: projectPath(projectDir, ".codex", "config.toml"),
      fallback: homePath(homeDir, ".codex", "config.toml"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
  openclaw: {
    installMethod: "guide",
    detectionPaths: ({ homeDir }: HostPathContext) => [homePath(homeDir, ".openclaw")],
    configTargets: ({ homeDir }: HostPathContext) => ({
      preferred: homePath(homeDir, ".openclaw", "openclaw.json"),
    }),
    contextTarget: ({ projectDir }: HostPathContext) => projectPath(projectDir, "AGENTS.md"),
  },
} as const;

export type SupportedHost = keyof typeof HOSTS;

export const SUPPORTED_HOSTS = Object.keys(HOSTS) as SupportedHost[];
