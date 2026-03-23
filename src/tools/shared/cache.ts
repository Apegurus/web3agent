interface CacheEntry {
  data: unknown;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();

const MAX_CACHE_SIZE = 500;

export async function ttlCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // Evict expired entries if cache is getting large
  if (cache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now >= v.expiry) cache.delete(k);
    }
    // If still too large after evicting expired, drop oldest entries
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = [...cache.entries()];
      entries.sort((a, b) => a[1].expiry - b[1].expiry);
      const toRemove = entries.length - MAX_CACHE_SIZE;
      for (let i = 0; i < toRemove; i++) {
        cache.delete(entries[i][0]);
      }
    }
  }

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests for the same key
  const inflight = pending.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, expiry: Date.now() + ttlMs });
      pending.delete(key);
      return data;
    })
    .catch((err: unknown) => {
      pending.delete(key);
      throw err;
    });

  pending.set(key, promise);
  return promise;
}

export function clearCache(): void {
  cache.clear();
  pending.clear();
}
