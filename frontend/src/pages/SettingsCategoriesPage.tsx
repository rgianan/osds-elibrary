import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LibraryDocument } from '@/types';
import { api } from '@/lib/gasClient';
import { CACHE_KEYS } from '@/lib/cache';
import { useResource } from '@/lib/useResource';
import { displayPath, setCategories, type CategoryRecord } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

const BLANK: Partial<CategoryRecord> = { label: '', parent_id: '', levels: 'year', aliases: '' };
const NO_CATEGORIES: CategoryRecord[] = [];
const NO_DOCUMENTS: LibraryDocument[] = [];

/**
 * Administrator-only editor for the document taxonomy.
 *
 * Renaming a category rewrites the stored path of every document filed under it, and the backend
 * refiles them and moves their Drive folder to match — so the cost of a rename is real but handled.
 * Deleting is blocked while a category still holds documents or subcategories, which is why the
 * document count sits in the table rather than behind a confirmation.
 */
export function SettingsCategoriesPage({ onBack }: { onBack: () => void }) {
  const categoriesResource = useResource<CategoryRecord[]>(
    CACHE_KEYS.categories,
    () => api.listCategories(),
    { fallbackMessage: 'Failed to load categories.' },
  );
  const docsResource = useResource<LibraryDocument[]>(CACHE_KEYS.documents, () => api.listDocuments());

  const rows = categoriesResource.data ?? NO_CATEGORIES;
  const documents = docsResource.data ?? NO_DOCUMENTS;
  const loading = categoriesResource.loading;

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<CategoryRecord> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CategoryRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const error = categoriesResource.error || actionError;

  // Whatever the tree currently is, the rest of the app (sidebar, dialogs, search) reads from the
  // same module store — so a save here reaches them without a reload.
  useEffect(() => {
    if (categoriesResource.data) setCategories(categoriesResource.data);
  }, [categoriesResource.data]);

  const childCount = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => { if (r.parent_id) counts.set(r.parent_id, (counts.get(r.parent_id) || 0) + 1); });
    return counts;
  }, [rows]);

  const documentCount = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => counts.set(d.category_path, (counts.get(d.category_path) || 0) + 1));
    return counts;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.label, r.path, r.aliases].join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  /**
   * Left to the server rather than applied optimistically: a rename here refiles every document
   * beneath the category and moves its Drive folder, so the row that comes back can differ from the
   * one sent. The write invalidates both cached lists and the page re-reads what actually landed.
   */
  async function save() {
    if (!editing) return;
    setSaving(true);
    setActionError('');
    try {
      await api.saveCategory(editing);
      setEditing(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the category.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Also not optimistic, and for a different reason: the server refuses a delete while the category
   * still holds documents or subcategories, and its refusal *is* the answer the admin needs. A row
   * that vanished and then reappeared carrying an error would read as a bug.
   */
  async function remove(row: CategoryRecord) {
    setPendingDelete(null);
    setActionError('');
    try {
      await api.deleteCategory(row.category_id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the category.');
    }
  }

  const columns: Column<CategoryRecord>[] = [
    {
      header: 'Category',
      cellClassName: 'align-top',
      render: (row) => (
        <div className="min-w-0" style={{ paddingLeft: `${(row.path.split('::').length - 1) * 16}px` }}>
          <div className="font-semibold text-foreground">{row.label}</div>
          {row.path.includes('::') ? <div className="text-xs text-muted-foreground">{displayPath(row.path)}</div> : null}
        </div>
      ),
    },
    {
      header: 'Files by',
      headerClassName: 'w-32',
      cellClassName: 'align-top',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {(childCount.get(row.category_id) || 0) > 0
            ? 'Grouping only'
            : row.levels.includes('month') ? 'Year, month' : 'Year'}
        </span>
      ),
    },
    {
      header: 'Search shorthand',
      cellClassName: 'align-top',
      render: (row) => row.aliases
        ? <span className="text-xs text-muted-foreground">{row.aliases}</span>
        : <span className="text-xs text-muted-foreground/60">Name only</span>,
    },
    {
      header: 'Documents',
      headerClassName: 'w-28',
      cellClassName: 'align-top',
      render: (row) => {
        const held = documentCount.get(row.path) || 0;
        return <span className={cn('font-semibold tabular-nums', held ? 'text-foreground' : 'text-muted-foreground')}>{held}</span>;
      },
    },
    {
      header: 'Actions',
      headerClassName: 'w-36',
      cellClassName: 'align-top',
      render: (row) => {
        const held = documentCount.get(row.path) || 0;
        const children = childCount.get(row.category_id) || 0;
        const blocked = held > 0 || children > 0;
        return (
          <div className="flex gap-2">
            <Tooltip content="Rename this category, change where it sits, or edit its search shorthand" asLabel>
              <Button type="button" size="icon" variant="outline" onClick={() => setEditing({ ...row })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip
              content={blocked
                ? `Cannot be deleted yet — it still holds ${held} document${held === 1 ? '' : 's'} and ${children} subcategor${children === 1 ? 'y' : 'ies'}`
                : 'Delete this category'}
              asLabel
            >
              <Button type="button" size="icon" variant="danger" onClick={() => setPendingDelete(row)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  // A category cannot be its own parent, and nesting is one level deep to match how the tree reads.
  const parentOptions = rows.filter((r) => !r.parent_id && r.category_id !== editing?.category_id);

  return (
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline" title="Return to the document library">
        <ArrowLeft className="h-4 w-4" /> Back to the library
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            The filing tree used by the sidebar, the upload dialog, and search. Renaming a category refiles every
            document under it and moves its Drive folder to match. A category cannot be deleted while it still holds
            documents or subcategories.
          </p>
        </div>
        <Tooltip content="Add a category to the filing tree">
          <Button onClick={() => setEditing({ ...BLANK })} className="shrink-0">
            <Plus className="h-4 w-4" /> ADD CATEGORY
          </Button>
        </Tooltip>
      </div>

      {error ? <Callout tone="error" className="mb-4">{error}</Callout> : null}

      <DataTableCard
        title={loading
          ? 'Loading categories...'
          : categoriesResource.error && !categoriesResource.data
          ? 'Categories'
          : `${rows.length.toLocaleString()} categories`}
        titleIcon={FolderTree}
        search={{ value: query, onChange: setQuery, placeholder: 'Search name, path, shorthand...', width: '320px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.category_id}
        loading={loading}
        error={categoriesResource.error}
        emptyMessage={query.trim() ? `No category matches “${query.trim()}”.` : 'No categories yet.'}
        emptyIcon={FolderTree}
        minWidth="1000px"
      />

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent
          title={editing?.category_id ? 'Edit Category' : 'Add Category'}
          description={editing?.category_id
            ? 'Renaming refiles every document under this category and moves its Drive folder to match.'
            : 'New categories appear in the sidebar and the upload dialog immediately.'}
          className="w-[min(96vw,640px)]"
        >
          <div className="space-y-4 p-6">
            <FieldLabel label="Name *">
              <Input
                value={editing?.label || ''}
                onChange={(e) => setEditing((form) => ({ ...(form || BLANK), label: e.target.value }))}
                placeholder="e.g. Position Papers"
                disabled={saving}
                autoFocus
                title="Shown in the sidebar and stored as the document's category"
              />
            </FieldLabel>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Sits under">
                <Select
                  value={editing?.parent_id || ''}
                  onChange={(e) => setEditing((form) => ({ ...(form || BLANK), parent_id: e.target.value }))}
                  disabled={saving}
                  title="Leave as a top-level category, or nest it under another"
                >
                  <option value="">Top level</option>
                  {parentOptions.map((r) => <option key={r.category_id} value={r.category_id}>{r.label}</option>)}
                </Select>
              </FieldLabel>

              <FieldLabel label="Files by">
                <Select
                  value={editing?.levels || 'year'}
                  onChange={(e) => setEditing((form) => ({ ...(form || BLANK), levels: e.target.value }))}
                  disabled={saving}
                  title="Whether documents here are filed by year alone, or by year and month"
                >
                  <option value="year">Year</option>
                  <option value="year,month">Year and month</option>
                </Select>
              </FieldLabel>
            </div>

            <FieldLabel label="Search shorthand">
              <Input
                value={editing?.aliases || ''}
                onChange={(e) => setEditing((form) => ({ ...(form || BLANK), aliases: e.target.value }))}
                placeholder="e.g. cmo, memorandum order"
                disabled={saving}
                title="Comma-separated. The category's own name always works — these are extras like acronyms."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Comma-separated extras so staff can type an acronym. The name itself always works.
              </p>
            </FieldLabel>
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-muted p-4">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving} title="Discard these changes">Cancel</Button>
            <Button type="button" onClick={save} disabled={saving} title="Save the category">
              {saving ? <ButtonSpinner label="Saving..." /> : 'Save Category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Delete category"
        confirmLabel="Delete category"
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      >
        <p>
          Delete the category <span className="font-semibold">{pendingDelete?.label}</span>?
        </p>
        <p className="mt-2 text-muted-foreground">
          It disappears from the sidebar, the upload dialog, and search. The server refuses while it still holds
          documents or subcategories.
        </p>
      </ConfirmDialog>
    </main>
  );
}
