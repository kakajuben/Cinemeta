// Shared network helpers: request timeouts + short-lived in-memory cache.
// Keeps slow or offline third-party servers from freezing the UI.

const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  at: number;
  body: string;
  ok: boolean;
  status: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

function prune() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.at > CACHE_TTL_MS) cache.delete(key);
  }
}

/**
 * Fetch with an abort timeout and a 60s response cache.
 * Returns a Response-like object so existing `res.ok` / `res.json()` code keeps working.
 */
export async function cachedFetch(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  prune();

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS) {
    return toResponseLike(hit);
  }

  const pending = inflight.get(url);
  if (pending) return toResponseLike(await pending);

  const task = (async (): Promise<CacheEntry> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.text();
      const entry: CacheEntry = { at: Date.now(), body, ok: res.ok, status: res.status };
      if (res.ok) cache.set(url, entry);
      return entry;
    } catch {
      // Network error, CORS block or timeout — fail softly, never cache.
      return { at: Date.now(), body: "", ok: false, status: 0 };
    } finally {
      clearTimeout(timer);
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return toResponseLike(await task);
}

function toResponseLike(entry: CacheEntry) {
  return {
    ok: entry.ok,
    status: entry.status,
    text: async () => entry.body,
    json: async () => {
      try {
        return JSON.parse(entry.body) as unknown;
      } catch {
        return null;
      }
    },
  };
}
