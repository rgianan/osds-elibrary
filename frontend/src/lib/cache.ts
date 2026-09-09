/**
 * A stale-while-revalidate cache for the read endpoints.
 *
 * Every list in this app is fetched over `google.script.run`, which costs the better part of a
 * second even when the sheet has not changed. Without a cache, walking Library → Settings → Tags →
 * Library refetches the same document list three times and blanks the screen each time. With one,
 * the second visit paints from memory and quietly re-reads in the background.
 *
 * Deliberately in memory only, never localStorage: the cached lists include Drive URLs and the
 * staff directory, and a stale copy surviving a browser restart is worse than a slower first paint.
 * The cache dies with the tab.
 *
 * Invalidation marks an entry stale rather than dropping it, so a mutation triggers a re-read
 * without emptying the table in the meantime.
 */

export const CACHE_KEYS = {
  documents: 'documents',
  tags: 'tags',
  categories: 'categories',
  users: 'users',
} as const;

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

type Entry = { value: unknown; at: number; stale: boolean };

const store = new Map<string, Entry>();
/** One in-flight request per key, so two components mounting together make one round trip. */
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

/** How long a fresh entry is served without re-reading. Long enough to cover navigation. */
const DEFAULT_MAX_AGE = 30_000;

function notify(key: string) {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of [...set]) listener();
}

export function peekEntry(key: string) {
  return store.get(key);
}

export function peek<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

/** Writes a value and wakes every subscriber — the path an optimistic update takes. */
export function put<T>(key: string, value: T) {
  store.set(key, { value, at: Date.now(), stale: false });
  notify(key);
}

/**
 * Marks keys stale and wakes their subscribers, which re-read. The current value stays readable so
 * the UI keeps showing the last known list while the fresh one is on its way.
 */
export function invalidate(...keys: string[]) {
  for (const key of keys) {
    const entry = store.get(key);
    if (entry) entry.stale = true;
    notify(key);
  }
}

/** Identity changed — nothing cached under the previous account may be shown to the next one. */
export function clearCache() {
  store.clear();
  inflight.clear();
  for (const key of [...listeners.keys()]) notify(key);
}

export function subscribe(key: string, listener: () => void) {
  const set = listeners.get(key) || new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { maxAge?: number; force?: boolean } = {},
): Promise<T> {
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const entry = store.get(key);
  const usable = entry && !entry.stale && Date.now() - entry.at < maxAge;
  if (usable && !options.force) return Promise.resolve(entry!.value as T);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const request = fetcher()
    .then((value) => {
      // Only the request that is still the current one may write: a `force` re-read started after
      // this one must not be overwritten by this one's older answer.
      if (inflight.get(key) === request) put(key, value);
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}
