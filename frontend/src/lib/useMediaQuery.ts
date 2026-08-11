import { useEffect, useState } from 'react';

/** Tailwind's `lg` breakpoint — below this the category rail becomes an overlay drawer. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener('change', sync);
    // Belt and braces: some environments resize the viewport without dispatching a
    // MediaQueryList change event (emulated viewports and some embedded webviews — the Apps Script
    // iframe among them). Without this the layout can stay stuck on the pre-resize breakpoint.
    // Re-setting the same boolean is a no-op in React, so the extra listener costs nothing.
    window.addEventListener('resize', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, [query]);

  return matches;
}
