import { cn } from '@/lib/utils';

/**
 * A placeholder block that mimics the shape of the content still loading.
 *
 * Preferred over a spinner wherever the eventual layout is known, because it shows *what* is
 * arriving and keeps the page from jumping when it does. Always `aria-hidden` — the region it sits
 * in carries `aria-busy` and a live message, so a screen reader hears "Loading documents" once
 * instead of reading out a wall of empty boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block rounded bg-muted el-shimmer', className)} />;
}

/**
 * Widths cycle through a fixed set rather than being random, so a re-render never reshuffles the
 * placeholder — a flickering skeleton reads as a bug.
 */
const LINE_WIDTHS = ['w-[92%]', 'w-[74%]', 'w-[85%]', 'w-[66%]'];

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('block space-y-1.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', LINE_WIDTHS[i % LINE_WIDTHS.length])} />
      ))}
    </span>
  );
}

/** Matches the icon-plus-two-lines shape used by the document table and the grid cards. */
export function SkeletonMedia({ size = 'h-7 w-7', lines = 2 }: { size?: string; lines?: number }) {
  return (
    <span className="flex items-start gap-2.5">
      <Skeleton className={cn('shrink-0 rounded-md', size)} />
      <SkeletonText lines={lines} className="min-w-0 flex-1 pt-0.5" />
    </span>
  );
}
