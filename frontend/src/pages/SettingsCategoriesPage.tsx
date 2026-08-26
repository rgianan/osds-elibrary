import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LibraryDocument } from '@/types';
import { api } from '@/lib/gasClient';
import { displayPath, setCategories, type CategoryRecord } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { DataTableCard, type Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

const BLANK: Partial<CategoryRecord> = { label: '', parent_id: '', levels: 'year', aliases: '' };

/**
 * Administrator-only editor for the document taxonomy.
 *
 * Renaming a category rewrites the stored path of every document filed under it, and the backend
 * refiles them and moves their Drive folder to match — so the cost of a rename is real but handled.
 * Deleting is blocked while a category still holds documents or subcategories, which is why the
 * document count sits in the table rather than behind a confirmation.
 */
export function SettingsCategoriesPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<CategoryRecord[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<CategoryRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [categories, docs] = await Promise.all([api.listCategories(), api.listDocuments()]);
      setRows(categories);
      setDocuments(docs);
      // Keep the rest of the app (sidebar, dialogs, search) on the same tree without a reload.
      setCategories(categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

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

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await api.saveCategory(editing);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the category.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CategoryRecord) {
    if (!confirm(`Delete the category "${row.label}"?`)) return;
    setError('');
    try {
      await api.deleteCategory(row.category_id);
      await load();
    } catch (err) {
      // The backend refuses while documents or subcategories remain, and says how many.
      setError(err instanceof Error ? err.message : 'Failed to delete the category.');
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
      render: (row) => (
        <div className="flex gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => setEditing({ ...row })} title="Rename this category, change where it sits, or edit its search shorthand">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="danger" onClick={() => remove(row)} title="Delete this category — only possible once it holds no documents or subcategories">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
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
        <Button onClick={() => setEditing({ ...BLANK })} className="shrink-0" title="Add a category to the filing tree">
          <Plus className="h-4 w-4" /> ADD CATEGORY
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}

      <DataTableCard
        title={`${rows.length} categories`}
        titleIcon={FolderTree}
        search={{ value: query, onChange: setQuery, placeholder: 'Search name, path, shorthand...', width: '320px' }}
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.category_id}
        loading={loading}
        emptyMessage="No categories yet."
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
    </main>
  );
}
