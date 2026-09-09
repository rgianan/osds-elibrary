import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCached, peek, peekEntry, put, subscribe } from '@/lib/cache';

export type Resource<T> = {
  data: T | undefined;
  /**
   * True only when there is nothing to show yet and nothing has gone wrong — a background re-read
   * must not blank the page, and a failed cold start must show its error rather than skeletons
   * that will never resolve.
   */
  loading: boolean;
  /** True while a re-read runs behind data that is already on screen. */
  refreshing: boolean;
  error: string;
  reload: () => Promise<void>;
  /** Writes straight to the cache, so every mounted page sees the change. Used for optimistic edits. */
  mutate: (next: T | ((current: T | undefined) => T)) => void;
  setError: (message: string) => void;
};

/**
 * Binds a component to one cache key: paints whatever is cached immediately, revalidates in the
 * background, and re-reads by itself when another part of the app invalidates the same key.
 *
 * `fetcher` is held in a ref, so callers can pass an inline arrow without memoising it.
 */
export function useResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { maxAge?: number; fallbackMessage?: string } = {},
): Resource<T> {
  const { maxAge, fallbackMessage = 'Failed to load.' } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const messageRef = useRef(fallbackMessage);
  messageRef.current = fallbackMessage;

  const [data, setData] = useState<T | undefined>(() => peek<T>(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      const value = await fetchCached<T>(key, () => fetcherRef.current(), { maxAge, force });
      if (!mounted.current) return;
      setData(value);
      setError('');
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : messageRef.current);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [key, maxAge]);

  // A write elsewhere either hands us a new value (adopt it) or marks the key stale (re-read it).
  useEffect(() => subscribe(key, () => {
    const entry = peekEntry(key);
    if (!entry) {
      setData(undefined);
      void run(true);
      return;
    }
    if (entry.stale) void run(false);
    else setData(entry.value as T);
  }), [key, run]);

  useEffect(() => { void run(false); }, [run]);

  const mutate = useCallback((next: T | ((current: T | undefined) => T)) => {
    const value = typeof next === 'function'
      ? (next as (current: T | undefined) => T)(peek<T>(key))
      : next;
    put(key, value);
  }, [key]);

  return {
    data,
    loading: data === undefined && !error,
    refreshing,
    error,
    reload: () => run(true),
    mutate,
    setError,
  };
}
