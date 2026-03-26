import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { HOSTS, SUPPORTED_HOSTS, type SupportedHost } from "./registry.js";

export interface DetectionResult {
  detected: SupportedHost[];
  projectDir: string;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
    // biome-ignore lint/suspicious/noEmptyBlockStatements: access() throws ENOENT when path doesn't exist
  } catch {
    return false;
  }
}

/**
 * Detect agent host environments from filesystem markers.
 *
 * Detection signals are derived from the host registry in `./registry.ts`.
 * Each host declares its own detection paths (project-level and/or user-level).
 *
 * @param projectDir - Project root to scan for project-level markers
 * @param homeDir - Override home directory for testing (defaults to os.homedir())
 */
export async function detectHosts(projectDir: string, homeDir?: string): Promise<DetectionResult> {
  const home = homeDir ?? homedir();
  const detected: SupportedHost[] = [];
  const checks = SUPPORTED_HOSTS.map((host) => ({
    host,
    paths: HOSTS[host].detectionPaths({ projectDir, homeDir: home }),
  }));

  await Promise.all(
    checks.map(async ({ host, paths }) => {
      for (const p of paths) {
        if (await dirExists(p)) {
          detected.push(host);
          return;
        }
      }
    })
  );

  const ordered = SUPPORTED_HOSTS.filter((h) => detected.includes(h));

  return { detected: ordered, projectDir };
}

/**
 * Resolve a single host from detection results.
 *
 * - If explicitHost provided and valid, return it
 * - If exactly 1 detected, return it
 * - If 0 detected, throw error
 * - If 2+ detected without --host, throw error listing detected hosts
 */
export function assertSingleHost(detected: SupportedHost[], explicitHost?: string): SupportedHost {
  if (explicitHost) {
    if (!SUPPORTED_HOSTS.includes(explicitHost as SupportedHost)) {
      throw new Error(
        `Unsupported host "${explicitHost}". Supported: ${SUPPORTED_HOSTS.join(", ")}`
      );
    }
    return explicitHost as SupportedHost;
  }

  if (detected.length === 0) {
    throw new Error(
      `No supported agent host detected. Run with --host to specify one of: ${SUPPORTED_HOSTS.join(", ")}`
    );
  }

  if (detected.length > 1) {
    throw new Error(
      `Multiple agent hosts detected: ${detected.join(", ")}. Use --host to specify which one.`
    );
  }

  return detected[0];
}
