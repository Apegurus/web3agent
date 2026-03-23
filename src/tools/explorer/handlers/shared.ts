import type { BlockscoutClient } from "../../../api/explorer/blockscout/client.js";
import type { EtherscanClient } from "../../../api/explorer/etherscan/client.js";
import type {
  BackendId,
  ExplorerCapability,
  ExplorerRouter,
} from "../../../api/explorer/router.js";

/** Default page size sent to Etherscan when user doesn't specify.
 * Etherscan allows up to 10000, but returning that many results would consume
 * excessive AI context window. 100 balances speed vs. context usage. */
export const ETHERSCAN_DEFAULT_PAGE_SIZE = 100;

/** Maximum number of event log entries Etherscan returns in a single response */
export const ETHERSCAN_MAX_LOG_RESULTS = 1000;

export interface ExplorerDeps {
  router: ExplorerRouter;
  blockscout: BlockscoutClient;
  etherscan: EtherscanClient | undefined;
}

/** Try primary backend, fall back on failure */
export async function withFallback<T>(
  deps: ExplorerDeps,
  chainId: number,
  capability: ExplorerCapability,
  primaryFn: (backend: BackendId) => Promise<T>
): Promise<T> {
  const primary = deps.router.resolve(chainId, capability);
  try {
    return await primaryFn(primary);
  } catch (e: unknown) {
    const fallback = deps.router.getFallback(chainId, capability);
    if (!fallback) throw e;
    process.stderr.write(
      `[explorer] ${primary} failed for ${capability} on chain ${chainId}, falling back to ${fallback}: ${e instanceof Error ? e.message : String(e)}\n`
    );
    return primaryFn(fallback);
  }
}

/** Require Etherscan client or throw */
export function requireEtherscan(
  etherscan: EtherscanClient | undefined
): NonNullable<typeof etherscan> {
  if (!etherscan) throw new Error("Etherscan not configured");
  return etherscan;
}
