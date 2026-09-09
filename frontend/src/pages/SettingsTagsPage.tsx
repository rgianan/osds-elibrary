import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import type { LibraryDocument, Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { CACHE_KEYS } from '@/lib/cache';
import { useResource } from '@/lib/useResource';
import { removeById, upsertById } from '@/lib/collection';
import { parseTags, toDisplayDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { TagChip } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { TagCreateDialog } from '@/components/TagCreateDialog';

const NO_TAGS: Tag[] = [];
const NO_DOCUMENTS: LibraryDocument[] = [];

export function SettingsTagsPage({ onBack }: { onBack: () => void }) {
  // Both lists are almost always already cached by the time this page opens — the library was
  // browsed first — so it paints populated and only checks for changes behind the content.
  const tagsResource = useResource<Tag[]>(CACHE_KEYS.tags, () => api.listTags(), { fallbackMessage: 'Failed to load tags.' });
  const docsResource = useResource<LibraryDocument[]>(CACHE_KEYS.documents, () => api.listDocuments());

  const rows = tagsResource.data ?? NO_TAGS;
  const documents = docsResource.data ?? NO_DOCUMENTS;
  const loading = tagsResource.loading;

  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const error = tagsResource.error || actionError;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

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

  // The number that makes the confirmation worth reading: how much a delete would actually touch.
  const pendingDeleteUsage = pendingDelete ? usageByTag.get(pendingDelete.name.toLowerCase()) || 0 : 0;

  async function remove(row: Tag) {
    setPendingDelete(null);
    setActionError('');
    const snapshot = rows;
    tagsResource.mutate(removeById(snapshot, row.tag_id, 'tag_id'));
    try {
      // Deleting a tag also strips it from every document that carried it, which is why the write
      // invalidates the document list too — the usage counts on this page re-read on their own.
      await api.deleteTag(row.tag_id);
    } catch (err) {
      tagsResource.mutate(snapshot);
      setActionError(err instanceof Error ? err.message : 'Failed to delete the tag.');
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
          <Tooltip content="Rename this tag or change its description" asLabel>
            <Button type="button" size="icon" variant="outline" onClick={() => { setEditing(row); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
          </Tooltip>
          <Tooltip content="Delete this tag and remove it from every document carrying it" asLabel>
            <Button type="button" size="icon" variant="danger" onClick={() => setPendingDelete(row)}><Trash2 className="h-4 w-4" /></Button>
          </Tooltip>
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
        <Tooltip content="Add a tag to the shared vocabulary available when filing documents">
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> ADD TAG
          </Button>
        </Tooltip>
      </div>

      {error ? <Callout tone="error" className="mb-4">{error}</Callout> : null}

      <DataTableCard
        title="Tag Vocabulary"
        titleIcon={Tags}
        search={{ value: query, onChange: setQuery, placeholder: 'Search tags...', width: '320px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.tag_id}
        loading={loading}
        error={tagsResource.error}
        emptyMessage={query.trim() ? `No tag matches “${query.trim()}”.` : 'No tags yet. Use ADD TAG to create the first one.'}
        emptyIcon={Tags}
        minWidth="900px"
      />

      <TagCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={(tag) => tagsResource.mutate((current) => upsertById(current ?? NO_TAGS, tag, 'tag_id'))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Delete tag"
        confirmLabel="Delete tag"
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      >
        <p>
          Delete the tag <span className="font-semibold">{pendingDelete?.name}</span>?
        </p>
        {pendingDeleteUsage > 0 ? (
          <p className="mt-2 text-muted-foreground">
            It is currently on {pendingDeleteUsage} document{pendingDeleteUsage === 1 ? '' : 's'}, and will be removed
            from {pendingDeleteUsage === 1 ? 'it' : 'each of them'}. The documents themselves are not affected.
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">No document is using it, so nothing else changes.</p>
        )}
      </ConfirmDialog>
    </main>
  );
}
