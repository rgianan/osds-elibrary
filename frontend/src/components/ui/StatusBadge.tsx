export function StatusBadge({ value }: { value: string }) {
  const className = value === 'ACTIVE'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : 'border-border bg-muted text-muted-foreground';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${className}`}>{value}</span>;
}

export function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${label}`}
          className="rounded-full px-0.5 leading-none text-primary/70 transition hover:text-primary"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
