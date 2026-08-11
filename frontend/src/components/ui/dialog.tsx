import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

/**
 * Stack of currently-open dialogs, so Escape closes only the topmost one. Without it, a dialog
 * opened on top of another (Create Tag over Upload Document) would close both on one keypress and
 * throw away the half-filled form underneath.
 */
const openDialogs: symbol[] = [];

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const setOpen = React.useCallback((next: boolean) => onOpenChange?.(next), [onOpenChange]);
  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>;
}

export function DialogClose({ children, asChild: _asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const ctx = React.useContext(DialogContext);
  return <button type="button" {...props} onClick={(event) => { props.onClick?.(event); ctx?.setOpen(false); }}>{children}</button>;
}

export function DialogContent({
  className,
  children,
  title,
  description,
}: React.HTMLAttributes<HTMLDivElement> & { title: string; description?: string }) {
  const ctx = React.useContext(DialogContext);
  const id = React.useRef(Symbol('dialog')).current;

  React.useEffect(() => {
    if (!ctx?.open) return;
    openDialogs.push(id);
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (openDialogs[openDialogs.length - 1] !== id) return; // not the topmost dialog
      ctx?.setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
    };
  }, [ctx?.open, ctx?.setOpen, id]);

  if (!ctx?.open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={() => ctx.setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
          'rounded-lg border border-border bg-card shadow-2xl',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          <button type="button" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground" onClick={() => ctx.setOpen(false)} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
