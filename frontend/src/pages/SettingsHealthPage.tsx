import { useState } from 'react';
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { IntegrityProblem, IntegrityReport } from '@/types';
import { api } from '@/lib/gasClient';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

const ISSUE_LABEL: Record<string, string> = {
  NO_FILE: 'No file recorded',
  DELETED: 'File deleted',
  TRASHED: 'File in the bin',
  MOVED: 'Moved out of place',
};

function issueTone(issue: string) {
  if (issue === 'DELETED' || issue === 'NO_FILE') return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (issue === 'TRASHED') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-primary/30 bg-primary/10 text-primary';
}

/**
 * Reconciles the library against Drive. Read-only by design: it reports what drifted but never
 * repairs, because the right repair (restore from the bin, refile, or delete the record) is a
 * judgement call that depends on what actually happened.
 */
export function SettingsHealthPage({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setRunning(true);
    setError('');
    try {
      setReport(await api.checkLibraryIntegrity());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be completed.');
    } finally {
      setRunning(false);
    }
  }

  const columns: Column<IntegrityProblem>[] = [
    {
      header: 'Issue',
      headerClassName: 'w-48',
      cellClassName: 'align-top',
      render: (row) => (
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', issueTone(row.issue))}>
          {ISSUE_LABEL[row.issue] || row.issue}
        </span>
      ),
    },
    {
      header: 'Document',
      cellClassName: 'align-top',
      render: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{row.name || <span className="text-muted-foreground">—</span>}</div>
          <div className="text-xs tabular-nums text-muted-foreground">{row.document_id}</div>
        </div>
      ),
    },
    { header: 'Detail', cellClassName: 'align-top', render: (row) => <span className="break-words text-muted-foreground">{row.detail}</span> },
  ];

  return (
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline" title="Return to the document library">
        <ArrowLeft className="h-4 w-4" /> Back to the library
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Library Health</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Checks every document against Drive and reports anything deleted, sent to the bin, or moved out of the
            folder the library expects. Staff have view-only access and cannot move or delete library files, so a
            discrepancy points at the owning account, an account with edit rights on the folder, or a change here that
            failed part-way.
          </p>
        </div>
        <Tooltip content="Compare every document against its Drive file. Nothing is changed.">
          <Button onClick={run} disabled={running} className="shrink-0">
            {running ? <ButtonSpinner label="Checking..." /> : <><RefreshCw className="h-4 w-4" /> RUN CHECK</>}
          </Button>
        </Tooltip>
      </div>

      {error ? <Callout tone="error" className="mb-4">{error}</Callout> : null}

      {report && !running ? (
        <Callout
          tone={report.ok ? 'success' : 'warning'}
          icon={report.ok ? CheckCircle2 : ShieldAlert}
          className="mb-4"
        >
          {report.message}
        </Callout>
      ) : null}

      {/*
        The check walks every document against Drive one file at a time, so on a full library it is
        the longest-running action in the app. A skeleton of the report it is about to produce says
        more about the wait than a spinning button does.
      */}
      {running ? (
        <div className="el-card el-themed p-5" aria-busy>
          <span className="sr-only" role="status">Checking the library against Drive...</span>
          <Skeleton className="mb-4 h-4 w-64" />
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </div>
      ) : null}

      {report && !running && report.problems.length > 0 ? (
        <DataTableCard
          title={`${report.problems.length.toLocaleString()} of ${report.checked.toLocaleString()} need attention`}
          titleIcon={ShieldAlert}
          columns={columns}
          rows={report.problems}
          getRowId={(row) => row.document_id + row.issue}
          emptyMessage="Nothing to report."
          minWidth="900px"
        />
      ) : null}

      {!report && !running ? (
        <div className="el-card el-themed">
          <EmptyState
            icon={ShieldCheck}
            message="Run the check to compare the library against Drive. Nothing is changed — this only reports."
            className="py-14"
          />
        </div>
      ) : null}
    </main>
  );
}
