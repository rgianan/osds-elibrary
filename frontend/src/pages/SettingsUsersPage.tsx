import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2, UserCog } from 'lucide-react';
import type { UserAccount } from '@/types';
import { api } from '@/lib/gasClient';
import { ADMIN_HOST_EMAIL, ALLOWED_EMAIL_DOMAIN } from '@/lib/permissions';
import { removeById, upsertById } from '@/lib/collection';
import { normalizeEmail } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';

const BLANK: Partial<UserAccount> = { name: '', email: '', active: 'TRUE' };

function activeValue(value: unknown) {
  return String(value ?? 'TRUE').toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
}

function isHost(row: Partial<UserAccount>) {
  return normalizeEmail(row.email || '') === ADMIN_HOST_EMAIL;
}

export function SettingsUsersPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<UserAccount[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<UserAccount> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  /**
   * Adding or removing a user adjusts that one account's Drive permission. This reconciles the
   * whole folder against the list — the recovery path if an individual change failed, or if
   * someone was given access in Drive by hand.
   */
  async function syncDriveAccess() {
    setSyncing(true);
    setError('');
    setSyncMessage('');
    try {
      const result = await api.syncLibraryAccess();
      setSyncMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync Drive access.');
    } finally {
      setSyncing(false);
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await api.listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.name, row.email, activeValue(row.active)].join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveUser({ ...editing, active: activeValue(editing.active) });
      setRows((current) => upsertById(current, saved, 'user_id'));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the user.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: UserAccount) {
    if (!confirm(`Remove ${row.email} from the E-Library? They will lose access immediately.`)) return;
    setError('');
    const snapshot = rows;
    setRows((current) => removeById(current, row.user_id, 'user_id'));
    try {
      await api.deleteUser(row.user_id);
    } catch (err) {
      setRows(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to remove the user.');
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
    { header: 'Status', render: (row) => <StatusBadge value={activeValue(row.active) === 'TRUE' ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      header: 'Actions',
      headerClassName: 'w-36',
      render: (row) => isHost(row) ? (
        <span className="text-xs text-muted-foreground">Protected</span>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => setEditing({ ...row, active: activeValue(row.active) })} title="Edit user"><Pencil className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="danger" onClick={() => remove(row)} title="Remove user"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const activeUsers = rows.filter((row) => activeValue(row.active) === 'TRUE').length;

  return (
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to the library
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Only @{ALLOWED_EMAIL_DOMAIN} accounts listed here with an ACTIVE status can sign in to the E-Library.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={syncDriveAccess} disabled={syncing} title="Re-check the Drive folder against this list">
            {syncing ? <ButtonSpinner label="Syncing..." /> : <><RefreshCw className="h-4 w-4" /> SYNC DRIVE ACCESS</>}
          </Button>
          <Button
            onClick={() => setEditing({ ...BLANK })}
            title="Grant a @ched.gov.ph account access to the E-Library and its Drive folder"
          >
            <Plus className="h-4 w-4" /> ADD USER
          </Button>
        </div>
      </div>

      {syncMessage ? (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{syncMessage}</div>
      ) : null}

      {error ? <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Summary label="Total Users" value={rows.length} />
        <Summary label="Active Users" value={activeUsers} />
        <Summary label="Inactive Users" value={rows.length - activeUsers} />
      </div>

      <DataTableCard
        title="E-Library Users"
        titleIcon={UserCog}
        search={{ value: query, onChange: setQuery, placeholder: 'Search name, email, status...', width: '340px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.user_id}
        loading={loading}
        emptyMessage="No users found."
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
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
