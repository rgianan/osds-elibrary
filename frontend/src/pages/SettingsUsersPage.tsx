import { useMemo, useState } from 'react';
import { ArrowLeft, Link2, Pencil, Plus, RefreshCw, Trash2, UserCog, Users } from 'lucide-react';
import type { UserAccount, UserDirectory } from '@/types';
import { api } from '@/lib/gasClient';
import { CACHE_KEYS } from '@/lib/cache';
import { useResource } from '@/lib/useResource';
import { ADMIN_HOST_EMAIL, ALLOWED_EMAIL_DOMAIN } from '@/lib/permissions';
import { normalizeEmail } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';

const NO_USERS: UserAccount[] = [];

const BLANK: Partial<UserAccount> = { name: '', email: '', active: 'TRUE' };

function activeValue(value: unknown) {
  return String(value ?? 'TRUE').toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
}

function isHost(row: Partial<UserAccount>) {
  return normalizeEmail(row.email || '') === ADMIN_HOST_EMAIL;
}

/** Email, not user_id: OMS accounts have no local row and would all share an empty id. */
function rowKey(row: UserAccount) {
  return row.email;
}

export function SettingsUsersPage({ onBack }: { onBack: () => void }) {
  const directory = useResource<UserDirectory>(
    CACHE_KEYS.users,
    () => api.listUsers(),
    { fallbackMessage: 'Failed to load users.' },
  );
  const rows = directory.data?.users ?? NO_USERS;
  const oms = directory.data?.oms ?? null;
  const loading = directory.loading;

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<UserAccount> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const error = directory.error || actionError;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  /**
   * Adding or removing a user adjusts that one account's Drive permission. This reconciles the
   * whole folder against the list — the recovery path if an individual change failed, or if
   * someone was given access in Drive by hand.
   */
  async function syncDriveAccess() {
    setSyncing(true);
    setActionError('');
    setSyncMessage('');
    try {
      const result = await api.syncLibraryAccess();
      setSyncMessage(result.message);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to sync Drive access.');
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.name, row.email, activeValue(row.active)].join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  /**
   * Not applied optimistically, unlike the delete below. The list is a server-side merge of the OMS
   * directory with the local overrides, so a saved row may *replace* an OMS entry for the same
   * address rather than being added to the list. Guessing at that merge here would be a second,
   * divergent implementation of it; the write invalidates the cached directory instead and the page
   * re-reads the merge the server actually performed.
   */
  async function save() {
    if (!editing) return;
    setSaving(true);
    setActionError('');
    try {
      await api.saveUser({ ...editing, active: activeValue(editing.active) });
      setEditing(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the user.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * A removal is unambiguous — the row goes — so it is applied straight away and the re-read that
   * follows only settles whether an OMS entry for the same address surfaces in its place.
   */
  async function remove(row: UserAccount) {
    setPendingDelete(null);
    setActionError('');
    const snapshot = directory.data;
    if (!snapshot) return;
    directory.mutate({ ...snapshot, users: snapshot.users.filter((user) => user.email !== row.email) });
    try {
      await api.deleteUser(row.user_id);
    } catch (err) {
      directory.mutate(snapshot);
      setActionError(err instanceof Error ? err.message : 'Failed to remove the user.');
    }
  }

  const columns: Column<UserAccount>[] = [
    {
      header: 'Name',
      cellClassName: 'font-semibold text-foreground',
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.name}
          {isHost(row) ? <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">Administrator</span> : null}
        </span>
      ),
    },
    { header: 'Email', render: (row) => row.email },
    {
      header: 'Source',
      headerClassName: 'w-40',
      render: (row) => row.source === 'OMS'
        ? (
          <Tooltip content="Comes from the Office Management System. Change it there, not here.">
            <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Link2 className="h-3 w-3" /> Office Mgmt
            </span>
          </Tooltip>
        )
        : <span className="text-xs text-muted-foreground">Added here</span>,
    },
    { header: 'Status', render: (row) => <StatusBadge value={activeValue(row.active) === 'TRUE' ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      header: 'Actions',
      headerClassName: 'w-36',
      render: (row) => {
        if (isHost(row)) return <span className="text-xs text-muted-foreground">Protected</span>;
        // OMS accounts have no local row to edit — they are maintained in the other system. Adding
        // an override here with the same email is how you deactivate one for the library alone.
        if (row.source === 'OMS') {
          return (
            <Tooltip content="Managed in the Office Management System. To override it for the E-Library, add the same email here.">
              <span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                From Office Mgmt
              </span>
            </Tooltip>
          );
        }
        return (
          <div className="flex gap-2">
            <Tooltip content="Edit this account's name or status" asLabel>
              <Button type="button" size="icon" variant="outline" onClick={() => setEditing({ ...row, active: activeValue(row.active) })}><Pencil className="h-4 w-4" /></Button>
            </Tooltip>
            <Tooltip content="Remove this account's E-Library access" asLabel>
              <Button type="button" size="icon" variant="danger" onClick={() => setPendingDelete(row)}><Trash2 className="h-4 w-4" /></Button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const activeUsers = rows.filter((row) => activeValue(row.active) === 'TRUE').length;
  // A failed read leaves every count at zero. Showing that as a figure would tell an admin the
  // library has no users at the exact moment it could not find out.
  const countsUnknown = !!directory.error && !directory.data;

  return (
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to the library
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Only @{ALLOWED_EMAIL_DOMAIN} accounts listed here with an ACTIVE status can sign in to the E-Library.
            {oms?.configured
              ? ' Active accounts in the Office Management System get access automatically; add someone here only if they are not in that system.'
              : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content="Re-check the Drive folder against this list, granting or revoking access to match">
            <Button variant="outline" onClick={syncDriveAccess} disabled={syncing}>
              {syncing ? <ButtonSpinner label="Syncing..." /> : <><RefreshCw className="h-4 w-4" /> SYNC DRIVE ACCESS</>}
            </Button>
          </Tooltip>
          <Tooltip content={`Grant a @${ALLOWED_EMAIL_DOMAIN} account access to the E-Library and its Drive folder`}>
            <Button onClick={() => setEditing({ ...BLANK })}>
              <Plus className="h-4 w-4" /> ADD USER
            </Button>
          </Tooltip>
        </div>
      </div>

      {oms?.configured && !oms.ok ? (
        <Callout tone="warning" className="mb-4">
          {oms.stale
            ? 'The Office Management System could not be reached, so this list is from the last successful read. Access still works, but recent changes there are not reflected yet.'
            : 'The Office Management System could not be reached, so only accounts added here have access right now.'}
          <span className="block text-xs opacity-80">{oms.reason}</span>
        </Callout>
      ) : null}

      {syncMessage ? <Callout tone="success" className="mb-4">{syncMessage}</Callout> : null}

      {error ? <Callout tone="error" className="mb-4">{error}</Callout> : null}

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Summary label="Total Users" value={rows.length} loading={loading} unavailable={countsUnknown} hint="Everyone the E-Library will admit, from both sources." />
        <Summary label="Active Users" value={activeUsers} loading={loading} unavailable={countsUnknown} hint="Accounts whose status allows them to sign in right now." />
        <Summary
          label="From Office Mgmt"
          value={rows.filter((row) => row.source === 'OMS').length}
          loading={loading}
          unavailable={countsUnknown}
          hint="Maintained in the Office Management System rather than here."
        />
      </div>

      <DataTableCard
        title="E-Library Users"
        titleIcon={UserCog}
        search={{ value: query, onChange: setQuery, placeholder: 'Search name, email, status...', width: '340px' }}
        columns={columns}
        rows={filtered}
        getRowId={rowKey}
        loading={loading}
        error={directory.error}
        emptyMessage={query.trim() ? `No user matches “${query.trim()}”.` : 'No users yet. Use ADD USER to grant the first account access.'}
        emptyIcon={Users}
        minWidth="820px"
      />

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent
          title={editing?.user_id ? 'Edit User' : 'Add User'}
          description={`The email must be an @${ALLOWED_EMAIL_DOMAIN} address.`}
          className="w-[min(96vw,560px)]"
        >
          <div className="space-y-4 p-6">
            <FieldLabel label="Name *">
              <Input
                value={editing?.name || ''}
                onChange={(e) => setEditing((form) => ({ ...(form || BLANK), name: e.target.value }))}
                placeholder="e.g. Maria Santos"
                disabled={saving}
                autoFocus
              />
            </FieldLabel>
            <FieldLabel label="Email *">
              <Input
                type="email"
                value={editing?.email || ''}
                onChange={(e) => setEditing((form) => ({ ...(form || BLANK), email: e.target.value }))}
                placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
                disabled={saving}
              />
            </FieldLabel>
            <FieldLabel label="Status">
              <Select
                value={activeValue(editing?.active)}
                onChange={(e) => setEditing((form) => ({ ...(form || BLANK), active: e.target.value }))}
                disabled={saving}
              >
                <option value="TRUE">Active</option>
                <option value="FALSE">Inactive</option>
              </Select>
            </FieldLabel>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-muted p-4">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <ButtonSpinner label="Saving..." /> : 'Save User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Remove access"
        confirmLabel="Remove access"
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      >
        <p>
          Remove <span className="font-semibold">{pendingDelete?.email}</span> from the E-Library?
        </p>
        <p className="mt-2 text-muted-foreground">
          They lose access immediately, including to the Drive folder. If they are still active in the Office
          Management System, that entry will take over instead.
        </p>
      </ConfirmDialog>
    </main>
  );
}

function Summary({ label, value, loading, unavailable, hint }: { label: string; value: number; loading?: boolean; unavailable?: boolean; hint: string }) {
  return (
    <Tooltip content={hint}>
      <div className="el-card el-themed cursor-help p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        {loading
          ? <Skeleton className="mt-2 h-7 w-12" />
          : unavailable
          ? <div className="mt-1.5 text-2xl font-semibold text-muted-foreground" title="Not known — the list could not be loaded">—</div>
          : <div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</div>}
      </div>
    </Tooltip>
  );
}
