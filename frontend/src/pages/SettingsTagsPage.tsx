import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import type { LibraryDocument, Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { removeById, upsertById } from '@/lib/collection';
import { parseTags, toDisplayDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { TagChip } from '@/components/ui/StatusBadge';
import { TagCreateDialog } from '@/components/TagCreateDialog';

export function SettingsTagsPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Tag[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [tags, docs] = await Promise.all([api.listTags(), api.listDocuments()]);
      setRows(tags);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // How many documents currently carry each tag — the number that makes a delete consequential.
  const usageByTag = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      for (const tag of parseTags(doc.tags)) {
        const key = tag.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.name, row.description].join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  async function remove(row: Tag) {
    const usage = usageByTag.get(row.name.toLowerCase()) || 0;
    const warning = usage
      ? `"${row.name}" is used by ${usage} document${usage === 1 ? '' : 's'}. Deleting it removes the tag from those documents. Continue?`
      : `Delete the tag "${row.name}"?`;
    if (!confirm(warning)) return;
    setError('');
    const snapshot = rows;
    setRows((current) => removeById(current, row.tag_id, 'tag_id'));
    try {
      await api.deleteTag(row.tag_id);
      void load();
    } catch (err) {
      setRows(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to delete the tag.');
    }
  }

  const columns: Column<Tag>[] = [
    { header: 'Tag', render: (row) => <TagChip label={row.name} /> },
    { header: 'Description', render: (row) => row.description || <span className="text-xs text-muted-foreground">—</span> },
    {
      header: 'Documents',
      headerClassName: 'w-32',
      render: (row) => <span className="font-semibold text-foreground/90">{usageByTag.get(row.name.toLowerCase()) || 0}</span>,
    },
    { header: 'Created', headerClassName: 'w-32', render: (row) => toDisplayDate(row.created_at) },
    {
      header: 'Actions',
      headerClassName: 'w-36',
      render: (row) => (
        <div className="flex gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => { setEditing(row); setDialogOpen(true); }} title="Edit tag"><Pencil className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="danger" onClick={() => remove(row)} title="Delete tag"><Trash2 className="h-4 w-4" /></Button>
        </div>
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
          <h1 className="text-2xl font-semibold text-foreground">Tags</h1>
          <p className="text-sm text-muted-foreground">
            The shared tag vocabulary. Staff can also create a tag directly from the upload dialog.
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          title="Add a tag to the shared vocabulary available when filing documents"
        >
          <Plus className="h-4 w-4" /> ADD TAG
        </Button>
      </div>

      {error ? <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}

      <DataTableCard
        title="Tag Vocabulary"
        titleIcon={Tags}
        search={{ value: query, onChange: setQuery, placeholder: 'Search tags...', width: '320px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.tag_id}
        loading={loading}
        emptyMessage="No tags yet. Use ADD TAG to create the first one."
        minWidth="900px"
      />

      <TagCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={(tag) => {
          setRows((current) => upsertById(current, tag, 'tag_id'));
          void load();
        }}
      />
    </main>
  );
}
