import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The "nothing here" state, given the same care as a populated one.
 *
 * A bare sentence of grey text reads like a failure; an icon plus a line about what would put
 * something here reads like a state the app expected. The message stays the caller's — the ones
 * in this app already say what to do next ("Use UPLOAD DOCUMENT to add the first one").
 */
export function EmptyState({
  icon: Icon = Inbox,
  message,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  message: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}
