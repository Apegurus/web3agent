import { join } from "node:path";

function projectPath(projectDir: string, ...segments: string[]): string {
  return join(projectDir, ...segments);
}

function homePath(homeDir: string, ...segments: string[]): string {
  return join(homeDir, ...segments);
}

export const HOSTS = {
  claude: {
    detectionPaths: ({ homeDir }: { projectDir: string; homeDir: string }) => [
      homePath(homeDir, ".claude"),
    ],
    configTargets: ({ projectDir, homeDir }: { projectDir: string; homeDir: string }) => ({
      preferred: projectPath(projectDir, ".mcp.json"),
      fallback: homePath(homeDir, ".claude", "mcp.json"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, "CLAUDE.md"),
  },
  cursor: {
    detectionPaths: ({ projectDir }: { projectDir: string; homeDir: string }) => [
      projectPath(projectDir, ".cursor"),
    ],
    configTargets: ({ projectDir }: { projectDir: string; homeDir: string }) => ({
      preferred: projectPath(projectDir, ".cursor", "mcp.json"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, ".cursor", "rules", "web3agent.mdc"),
  },
  windsurf: {
    detectionPaths: ({ projectDir, homeDir }: { projectDir: string; homeDir: string }) => [
      projectPath(projectDir, ".windsurf"),
      homePath(homeDir, ".codeium", "windsurf"),
    ],
    configTargets: ({ homeDir }: { projectDir: string; homeDir: string }) => ({
      preferred: homePath(homeDir, ".codeium", "windsurf", "mcp_config.json"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, ".windsurf", "rules", "web3agent.md"),
  },
  opencode: {
    detectionPaths: ({ projectDir }: { projectDir: string; homeDir: string }) => [
      projectPath(projectDir, ".opencode"),
    ],
    configTargets: ({ projectDir }: { projectDir: string; homeDir: string }) => ({
      preferred: projectPath(projectDir, ".opencode", "config.json"),
      fallback: projectPath(projectDir, "opencode.json"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, "AGENTS.md"),
  },
  codex: {
    detectionPaths: ({ projectDir, homeDir }: { projectDir: string; homeDir: string }) => [
      projectPath(projectDir, ".codex"),
      homePath(homeDir, ".codex"),
    ],
    configTargets: ({ projectDir, homeDir }: { projectDir: string; homeDir: string }) => ({
      preferred: projectPath(projectDir, ".codex", "config.toml"),
      fallback: homePath(homeDir, ".codex", "config.toml"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, "AGENTS.md"),
  },
  openclaw: {
    detectionPaths: ({ homeDir }: { projectDir: string; homeDir: string }) => [
      homePath(homeDir, ".openclaw"),
    ],
    configTargets: ({ homeDir }: { projectDir: string; homeDir: string }) => ({
      preferred: homePath(homeDir, ".openclaw", "openclaw.json"),
    }),
    contextTarget: ({ projectDir }: { projectDir: string; homeDir: string }) =>
      projectPath(projectDir, "AGENTS.md"),
  },
} as const;

export type SupportedHost = keyof typeof HOSTS;

export const SUPPORTED_HOSTS = Object.keys(HOSTS) as SupportedHost[];
