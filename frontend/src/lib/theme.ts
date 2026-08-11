import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'elibrary-theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* private browsing or blocked storage — fall back to the system default */
  }
  return 'system';
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The theme actually painted, once 'system' has been resolved against the OS setting. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Lets the browser theme native widgets (form controls, scrollbars) to match.
  root.style.colorScheme = resolved;
}

/**
 * Applies the stored preference before React renders, so the page never flashes the wrong theme.
 * Called from main.tsx.
 */
export function initTheme() {
  applyTheme(readStoredPreference());
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  // Held in state, not derived at render: when the OS flips while on 'system' the DOM updates but
  // nothing re-renders, so a derived value would leave the UI reporting the old theme.
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStoredPreference()));

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preference simply will not persist */
    }
    applyTheme(next);
    setResolved(resolveTheme(next));
  }, []);

  // While on 'system', follow the OS if the user flips it (e.g. a scheduled night mode).
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return { preference, setPreference, resolved };
}
