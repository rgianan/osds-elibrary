import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
} as const;

// A CSS spinner: a ring with one colored segment that rotates (Tailwind's animate-spin).
export function Spinner({ size = 'md', className, label = 'Loading' }: { size?: keyof typeof SIZES; className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-block animate-spin rounded-full border-border border-t-primary align-[-0.125em]', SIZES[size], className)}
    />
  );
}

// Spinner + message, centered. Use for full-area loading states.
export function LoadingState({ message = 'Loading...', size = 'md', className }: { message?: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 text-muted-foreground', className)}>
      <Spinner size={size} />
      {message ? <span className="text-sm">{message}</span> : null}
    </div>
  );
}

// Spinner + label for inside a solid (colored) button while it is busy.
export function ButtonSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" className="border-white/40 border-t-white" />
      {label}
    </span>
  );
}
