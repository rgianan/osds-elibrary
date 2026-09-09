import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A real tooltip, replacing the browser's `title` attribute on the controls that depend on one.
 *
 * `title` was doing a lot of work in this app — most of the icon-only buttons have no visible text
 * at all — but it is a poor fit for it: the browser waits about a second before showing anything,
 * renders it in the OS style rather than the app's, truncates multi-line text unpredictably, and
 * never appears for a keyboard user at all. This shows on hover *and* on focus, after a short
 * delay, in the app's own theme.
 *
 * It renders into `document.body` rather than beside the trigger, because several triggers sit
 * inside `overflow-auto` containers (the document table, the category rail) that would clip it.
 *
 * Accessibility: the tip is always wired up as `aria-describedby`. For an icon-only control that
 * has no other accessible name, pass `asLabel` and the same text also becomes its `aria-label`.
 */

const SHOW_DELAY_MS = 140;
const GAP_PX = 8;

type Anchor = { top: number; bottom: number; left: number; width: number };
type Placement = { x: number; y: number };

/**
 * Parked off-screen for the measuring pass. It has to be laid out to be measured, and it has to be
 * measured before it can be placed.
 */
const OFFSCREEN = 'translate(-9999px, -9999px)';

export function Tooltip({
  content,
  side = 'top',
  asLabel = false,
  delay = SHOW_DELAY_MS,
  children,
}: {
  content: ReactNode;
  side?: 'top' | 'bottom';
  /** Also expose the text as the trigger's accessible name. For icon-only controls. */
  asLabel?: boolean;
  /**
   * Longer for rows in a dense list. The snappy default is right for a toolbar of icon buttons,
   * where the pointer arrives deliberately; running an eye down the category rail crosses a dozen
   * rows on the way to one, and a tip firing at each would be noise.
   */
  delay?: number;
  children: ReactElement;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
    setPlacement(null);
  }, []);

  const show = useCallback((target: HTMLElement) => {
    // Touch devices have no hover, and a tooltip that appears on tap just covers what was tapped.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
      setPlacement(null);
    }, delay);
  }, [delay]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Anything that moves the trigger out from under the tip dismisses it: the position is a snapshot
  // and would otherwise be left pointing at empty space.
  useEffect(() => {
    if (!anchor) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [anchor, hide]);

  /**
   * Measured first, then placed — and placed entirely with `transform`, never with `left`/`top`.
   *
   * That is not a style preference. A fixed element given `left: 900px` is laid out into the space
   * remaining to the viewport's right edge, so a tip anchored to a control near the right margin
   * would be squeezed into a 76px column and wrapped down to five lines, no matter what `max-width`
   * said. Left at `left: 0`, it takes its natural width, and the translate moves it afterwards
   * without touching layout.
   */
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 8;

    let resolved = side;
    if (side === 'top' && anchor.top < tip.height + GAP_PX + margin) resolved = 'bottom';
    else if (side === 'bottom' && anchor.bottom + tip.height + GAP_PX + margin > window.innerHeight) resolved = 'top';

    const y = resolved === 'top' ? anchor.top - GAP_PX - tip.height : anchor.bottom + GAP_PX;
    // Centred on the trigger, then pulled back inside whichever edge it would have overhung.
    const furthestLeft = Math.max(margin, window.innerWidth - tip.width - margin);
    const x = Math.min(Math.max(anchor.left + anchor.width / 2 - tip.width / 2, margin), furthestLeft);

    setPlacement((current) => (current && current.x === x && current.y === y ? current : { x, y }));
  }, [anchor, side]);

  if (!isValidElement(children)) return children;
  if (content === null || content === undefined || content === '') return children;

  const props = children.props as Record<string, unknown>;
  const call = (name: string, event: unknown) => {
    const handler = props[name];
    if (typeof handler === 'function') (handler as (arg: unknown) => void)(event);
  };

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': anchor ? id : undefined,
    'aria-label': asLabel && typeof content === 'string' ? content : props['aria-label'],
    onMouseEnter: (event: MouseEvent<HTMLElement>) => { show(event.currentTarget); call('onMouseEnter', event); },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => { hide(); call('onMouseLeave', event); },
    onFocus: (event: FocusEvent<HTMLElement>) => { show(event.currentTarget); call('onFocus', event); },
    onBlur: (event: FocusEvent<HTMLElement>) => { hide(); call('onBlur', event); },
    // Clicking has its own consequence to look at; the tip has served its purpose by then.
    onPointerDown: (event: PointerEvent<HTMLElement>) => { hide(); call('onPointerDown', event); },
  });

  return (
    <>
      {trigger}
      {anchor
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              className={cn(
                'pointer-events-none fixed left-0 top-0 z-[100] max-w-xs rounded-md border border-border bg-card',
                'px-2.5 py-1.5 text-xs leading-5 text-foreground shadow-lg',
                placement ? 'el-tooltip-in' : 'invisible',
              )}
              style={{ transform: placement ? `translate(${placement.x}px, ${placement.y}px)` : OFFSCREEN }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
