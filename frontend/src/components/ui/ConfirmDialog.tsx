import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Replaces `window.confirm` for the destructive actions.
 *
 * Two reasons beyond looks. The native dialog is drawn by the browser chrome in its own style,
 * which is jarring in an app that themes everything else — and inside the Apps Script iframe it
 * renders attributed to script.google.com, which reads like a security prompt rather than a
 * question from the E-Library. It is also synchronous: it freezes the page, so nothing can be shown
 * mid-decision and the wording cannot be marked up at all.
 *
 * The cancel button takes focus rather than the confirm button, so a stray Enter on a delete
 * prompt backs out instead of destroying something.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmLabel = 'Delete',
  destructive = true,
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent title={title} className="w-[min(96vw,460px)]">
        <div className="flex items-start gap-3 p-6">
          {destructive ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0 text-sm leading-6 text-foreground">{children}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted p-4">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant={destructive ? 'danger' : 'default'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
