import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import type { AuditEntry } from '@/types';
import { api } from '@/lib/gasClient';
import { Button } from '@/components/ui/button';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const LIMITS = [25, 50, 100, 200];

/** Colour by verb, so a page of entries can be scanned for deletions without reading every row. */
function actionTone(action: string) {
  // Coerced rather than trusted: a hand-edited sheet row can arrive with the column missing, and
  // calling .startsWith on undefined would take the whole page down.
  const value = String(action || '');
  if (value.startsWith('DELETE')) return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (value.startsWith('CREATE')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value.startsWith('UPDATE')) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  if (value === 'ASK') return 'border-primary/30 bg-primary/10 text-primary';
  return 'border-border bg-muted text-muted-foreground';
}

/** "CREATE_DOCUMENT" reads better as "Create document" in a column people scan. */
function humanizeAction(action: string) {
  const [verb, ...rest] = String(action || '').split('_');
  const subject = rest.join(' ').toLowerCase();
  const label = `${verb.charAt(0)}${verb.slice(1).toLowerCase()}${subject ? ` ${subject}` : ''}`;
  // A blank action would render an empty badge; match the em dash the other columns use.
  return label.trim() || '—';
}

/**
 * The sheet stores "yyyy-MM-dd HH:mm:ss". Parsed by pattern rather than `new Date()` so the clock
 * time recorded in Manila is shown as recorded, not shifted into the viewer's timezone.
 *
 * Rows written before the backend preserved the time of day carry a bare date; those show the date
 * alone rather than a made-up midnight.
 */
function formatStamp(value: string) {
  const raw = String(value || '');
  const withTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (withTime) {
    const [, year, month, day, hour, minute] = withTime;
    const h = Number(hour);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = String(h % 12 || 12).padStart(2, '0');
    return `${month}/${day}/${year}, ${hour12}:${minute} ${period}`;
  }
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${month}/${day}/${year}`;
  }
  return raw;
}

export function SettingsAuditPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.listAuditLog(pageSize, page * pageSize).then(
      (result) => { if (!cancelled) { setRows(result.entries); setTotal(result.total); setLoading(false); } },
      (err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load the audit log.');
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [pageSize, page]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : page * pageSize + 1;
  const lastShown = Math.min((page + 1) * pageSize, total);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.timestamp, row.actor_email, row.actor_name, row.action, humanizeAction(row.action), row.sheet_name, row.record_id, row.details]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const columns: Column<AuditEntry>[] = [
    {
      header: 'When',
      headerClassName: 'w-48',
      cellClassName: 'align-top whitespace-nowrap tabular-nums text-muted-foreground',
      // Seconds are kept in the tooltip: useful when reconstructing a sequence, noise in the column.
      render: (row) => <span title={row.timestamp}>{formatStamp(row.timestamp)}</span>,
    },
    {
      header: 'Who',
      headerClassName: 'w-64',
      cellClassName: 'align-top',
      // Name over email: the name is what an auditor reads, the email is what identifies the
      // account unambiguously when two people share a name.
      render: (row) => (
        <div className="min-w-0">
          {row.actor_name ? (
            <div className="truncate font-medium text-foreground">{row.actor_name}</div>
          ) : null}
          <div className={cn('truncate', row.actor_name ? 'text-xs text-muted-foreground' : 'text-foreground/90')}>
            {row.actor_email || <span className="text-muted-foreground">—</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Action',
      headerClassName: 'w-44',
      cellClassName: 'align-top',
      render: (row) => (
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', actionTone(row.action))}>
          {humanizeAction(row.action)}
        </span>
      ),
    },
    {
      header: 'Record',
      headerClassName: 'w-44',
      cellClassName: 'align-top',
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate text-foreground/90">{row.record_id || <span className="text-muted-foreground">—</span>}</div>
          <div className="truncate text-xs text-muted-foreground">{row.sheet_name}</div>
        </div>
      ),
    },
    {
      header: 'Details',
      cellClassName: 'align-top',
      render: (row) => (
        <span className="break-words text-muted-foreground">{row.details || '—'}</span>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to the library
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every create, update, and delete across documents, tags, and users — plus each Ask question — with the
            account that performed it. Newest first. Read-only.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Per page
          <Select
            className="h-9 w-24"
            value={String(pageSize)}
            title="How many entries to load at a time. Only the current page is read from the sheet."
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          >
            {LIMITS.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </label>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}

      <DataTableCard
        title={total === 0 ? 'No entries' : `Showing ${firstShown}–${lastShown} of ${total}`}
        titleIcon={ScrollText}
        // The filter runs over the loaded page, not the whole trail — labelled so nobody reads an
        // empty result as "this never happened".
        search={{ value: query, onChange: setQuery, placeholder: 'Filter this page...', width: '300px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.audit_id}
        loading={loading}
        loadingMessage="Loading the audit log..."
        emptyMessage={query ? `No entry matches “${query.trim()}”.` : 'No activity recorded yet.'}
        minWidth="1000px"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Entries are written by the backend and are not editable from this app. The underlying
          <span className="font-medium text-foreground/80"> Audit_Log </span>
          sheet is the system of record.
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">Page {page + 1} of {pageCount}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={loading || page === 0}
            title="Go to more recent activity"
          >
            <ChevronLeft className="h-4 w-4" /> Newer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((value) => value + 1)}
            disabled={loading || page + 1 >= pageCount}
            title="Go further back in the trail"
          >
            Older <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}
