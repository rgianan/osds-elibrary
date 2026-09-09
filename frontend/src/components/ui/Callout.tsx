import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one banner used for every inline error, warning, and confirmation in the app.
 *
 * These were previously hand-rolled at each call site, which is how three of them ended up with
 * `rounded` where the rest had `rounded-md`, and how only some announced themselves to a screen
 * reader. Errors get `role="alert"` (interrupts); everything else gets `role="status"` (waits for
 * a pause), which is the right split for messages the user did not ask for versus results of an
 * action they just took.
 */

type Tone = 'error' | 'warning' | 'success' | 'info';

const TONES: Record<Tone, { className: string; icon: ComponentType<{ className?: string }> }> = {
  error: {
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: XCircle,
  },
  warning: {
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
  },
  success: {
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  info: {
    className: 'border-primary/30 bg-primary/10 text-primary',
    icon: Info,
  },
};

export function Callout({
  tone = 'info',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  /** Overrides the tone's default icon; `false` drops it entirely. */
  icon?: ComponentType<{ className?: string }> | false;
  children: ReactNode;
  className?: string;
}) {
  const preset = TONES[tone];
  const Icon = icon === false ? null : icon || preset.icon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md border p-3 text-sm', preset.className, className)}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
