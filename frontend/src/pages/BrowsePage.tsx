import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FolderInput, LayoutGrid, List, PanelLeftClose, PanelLeftOpen, Pencil, Search, Trash2, Upload } from 'lucide-react';
import type { CurrentUser, LibraryDocument, Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { breadcrumbLabel, displayPath, isLeafPath, isWithinPath, joinPath, monthLabel, splitPath, yearOptions } from '@/lib/categories';
import { fileKindFor } from '@/lib/fileKind';
import { canModifyDocument } from '@/lib/permissions';
import { removeById, upsertById } from '@/lib/collection';
import { parseQuery, removeChip, searchDocuments, type QueryChip } from '@/lib/search';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { formatFileSize, parseTags, toDisplayDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TagChip } from '@/components/ui/StatusBadge';
import { CategorySidebar, type LibrarySelection } from '@/components/CategorySidebar';
import { DocumentGrid } from '@/components/DocumentGrid';
import { UploadDocumentDialog } from '@/components/UploadDocumentDialog';
import { MoveDocumentDialog } from '@/components/MoveDocumentDialog';
import { AskDialog } from '@/components/AskDialog';
import { cn } from '@/lib/utils';

const EMPTY_SELECTION: LibrarySelection = { path: '', year: '', month: '' };

type ViewMode = 'list' | 'grid';
const VIEW_STORAGE_KEY = 'elibrary-view';

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

/** A document belongs to a selection when it sits at, or below, the selected node. */
function matchesSelection(doc: LibraryDocument, selection: LibrarySelection) {
  if (!isWithinPath(doc.category_path, selection.path)) return false;
  if (selection.year && String(doc.year) !== selection.year) return false;
  if (selection.month && String(doc.month) !== selection.month) return false;
  return true;
}

export function BrowsePage({
  user,
  searchQuery,
  onSearchChange,
  askOpen,
  onAskOpenChange,
}: {
  user: CurrentUser;
  searchQuery: string;
  onSearchChange: (next: string) => void;
  askOpen: boolean;
  onAskOpenChange: (open: boolean) => void;
}) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selection, setSelection] = useState<LibrarySelection>(EMPTY_SELECTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [moving, setMoving] = useState<LibraryDocument | null>(null);
  const [view, setView] = useState<ViewMode>(readStoredView);

  // The rail is a permanent column on desktop and an overlay drawer below `lg`, where a 310px
  // column would leave nothing for the documents themselves.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);

  // Crossing the breakpoint resets to that layout's sensible default: shown on desktop, closed on
  // mobile — otherwise a drawer left open would reappear as a pinned column after a rotation.
  useEffect(() => { setSidebarOpen(isDesktop); }, [isDesktop]);

  const years = useMemo(() => yearOptions(), []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* the choice simply will not persist */
    }
  }

  const loadTags = useCallback(async () => {
    try {
      setTags(await api.listTags());
    } catch {
      /* the tag vocabulary is non-critical for browsing — leave it empty on failure */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docs] = await Promise.all([api.listDocuments(), loadTags()]);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the library.');
    } finally {
      setLoading(false);
    }
  }, [loadTags]);

  useEffect(() => { void load(); }, [load]);

  /**
   * The sidebar asks for a count per category, per year, and per month — hundreds of queries on
   * every render, including every keystroke in the search box. Counting by scanning the document
   * list each time is O(nodes x documents) and degrades badly as the library grows, so each
   * document increments its own bucket plus every ancestor bucket once, and lookups are O(1).
   */
  const countIndex = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (key: string) => counts.set(key, (counts.get(key) || 0) + 1);
    for (const doc of documents) {
      const segments = splitPath(doc.category_path);
      const year = String(doc.year || '');
      const month = String(doc.month || '');
      bump('||');
      for (let i = 1; i <= segments.length; i++) {
        const prefix = joinPath(segments.slice(0, i));
        bump(`${prefix}||`);
        bump(`${prefix}|${year}|`);
        if (month) bump(`${prefix}|${year}|${month}`);
      }
    }
    return counts;
  }, [documents]);

  const countFor = useCallback(
    (target: LibrarySelection) => countIndex.get(`${target.path}|${target.year}|${target.month}`) || 0,
    [countIndex],
  );

  // Searching and browsing are one mode at a time: a search covers the whole library (otherwise
  // "CMO 2016" typed while sitting in Budget would find nothing), and picking a category clears it.
  const searching = searchQuery.trim().length > 0;
  const parsed = useMemo(() => parseQuery(searchQuery), [searchQuery]);

  const visible = useMemo(() => {
    if (searching) return searchDocuments(documents, parsed);
    return documents
      .filter((doc) => matchesSelection(doc, selection))
      .sort((a, b) => {
        if (a.year !== b.year) return Number(b.year) - Number(a.year);
        if ((a.month || '') !== (b.month || '')) return String(b.month || '').localeCompare(String(a.month || ''));
        return a.name.localeCompare(b.name);
      });
  }, [documents, selection, searching, parsed]);

  // Typing a search takes over from the sidebar, so drop the category highlight. Leaving it lit
  // would imply the results are scoped to that category when a search always spans the library.
  useEffect(() => {
    if (searching) setSelection(EMPTY_SELECTION);
  }, [searching]);

  function selectCategory(next: LibrarySelection) {
    onSearchChange('');
    setSelection(next);
    // On mobile the drawer covers the results it just filtered, so get out of the way.
    if (!isDesktop) setSidebarOpen(false);
  }

  function dropChip(chip: QueryChip) {
    onSearchChange(removeChip(parsed, chip));
  }

  function openUpload() {
    setEditing(null);
    setUploadOpen(true);
  }

  function openEdit(row: LibraryDocument) {
    setEditing(row);
    setUploadOpen(true);
  }

  async function remove(row: LibraryDocument) {
    if (!confirm(`Delete "${row.name}"? The file is also removed from the E-Library Drive folder.`)) return;
    setError('');
    const snapshot = documents;
    setDocuments((current) => removeById(current, row.document_id, 'document_id'));
    try {
      await api.deleteDocument(row.document_id);
    } catch (err) {
      setDocuments(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to delete the document.');
    }
  }

  const heading = searching
    ? (parsed.terms.length ? `Search results for “${parsed.terms.join(' ')}”` : 'Search results')
    : selection.path
    ? breadcrumbLabel(selection.path, selection.year, selection.month)
    : 'All Documents';

  // Only a leaf path is a valid filing destination, so a parent node (e.g. "Issuances") pre-fills
  // nothing and the user picks the exact subcategory in the dialog.
  const uploadDefaults = useMemo(
    () => (isLeafPath(selection.path)
      ? { category_path: selection.path, year: selection.year, month: selection.month }
      : {}),
    [selection],
  );

  const emptyMessage = searching
    ? `Nothing in the library matches “${searchQuery.trim()}”.`
    : 'No documents filed here yet. Use UPLOAD DOCUMENT to add the first one.';

  const columns: Column<LibraryDocument>[] = [
    {
      header: 'Document',
      cellClassName: 'align-top',
      render: (row) => {
        const kind = fileKindFor(row.file_name, row.mime_type);
        const Icon = kind.icon;
        return (
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${kind.className}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-foreground">{row.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {row.file_name}
                {formatFileSize(row.file_size) ? ` · ${formatFileSize(row.file_size)}` : ''}
              </div>
              {row.remarks ? <div className="mt-1 text-xs italic text-muted-foreground">{row.remarks}</div> : null}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Category',
      cellClassName: 'align-top',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-foreground/90">{displayPath(row.category_path)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {row.year}
            {row.month ? ` · ${monthLabel(row.month)}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Tags',
      cellClassName: 'align-top',
      render: (row) => {
        const list = parseTags(row.tags);
        if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return <div className="flex flex-wrap gap-1">{list.map((tag) => <TagChip key={tag} label={tag} />)}</div>;
      },
    },
    {
      header: 'Uploaded By',
      cellClassName: 'align-top',
      // Uploader and date on one line, as one fact about the upload rather than two stacked rows.
      render: (row) => (
        <span className="whitespace-nowrap text-foreground/90">
          {row.uploaded_by_name || row.uploaded_by}
          <span className="text-muted-foreground"> · {toDisplayDate(row.date_uploaded)}</span>
        </span>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'w-40',
      cellClassName: 'align-top',
      render: (row) => (
        <div className="flex gap-2">
          <a
            href={row.file_url || '#'}
            target="_blank"
            rel="noreferrer"
            title="Open the file"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:border-primary hover:text-primary"
          >
            <Download className="h-4 w-4" />
          </a>
          {canModifyDocument(user, row.uploaded_by) ? (
            <>
              <Button type="button" size="icon" variant="outline" onClick={() => openEdit(row)} title="Edit this document's name, tags, or remarks"><Pencil className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" onClick={() => setMoving(row)} title="Move to a different category or year — the Drive file follows"><FolderInput className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="danger" onClick={() => remove(row)} title="Delete this document and its file from Drive"><Trash2 className="h-4 w-4" /></Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    // Capped only far beyond 1080p, so a 1920-wide screen fills edge to edge instead of leaving
    // ~300px of dead margin either side.
    <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">E-Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Browse, search, and file OSDS documents from 1994 to the present.
          </p>
        </div>
        <Button
          onClick={openUpload}
          className="shrink-0"
          title="Add a document to the library — PDF, Word, Excel, or image, up to 15 MB"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">UPLOAD DOCUMENT</span>
          <span className="sm:hidden">UPLOAD</span>
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}

      <div className="flex items-start gap-6">
        {/* Drawer backdrop, mobile only. */}
        {sidebarOpen && !isDesktop ? (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        ) : null}

        {/*
          One instance, two layouts: a fixed overlay drawer below `lg`, a static column at `lg` and
          up. Rendering it once keeps the expanded-branch state intact across a resize.
        */}
        <div
          // Closed, the drawer is only translated off-screen, so without `invisible` its category
          // buttons stay in the tab order — a keyboard or screen-reader user would walk into a rail
          // they cannot see. `lg:hidden` covers the collapsed desktop case.
          aria-hidden={!sidebarOpen}
          className={cn(
            'z-50 shrink-0 transition-transform duration-200 lg:z-auto lg:transition-none',
            'fixed inset-y-0 left-0 w-[86vw] max-w-[320px] overflow-y-auto p-3',
            'lg:static lg:inset-auto lg:w-auto lg:translate-x-0 lg:overflow-visible lg:p-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full invisible pointer-events-none lg:hidden',
          )}
        >
          <CategorySidebar selection={selection} onSelect={selectCategory} years={years} countFor={countFor} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-expanded={sidebarOpen}
              title={sidebarOpen ? 'Hide categories' : 'Show categories'}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
              Categories
            </button>
            {searching ? <Search className="h-4 w-4 text-muted-foreground" /> : null}
            <span className="font-medium text-foreground">{heading}</span>

            {searching
              ? parsed.chips.map((chip) => (
                  <button
                    key={`${chip.kind}-${chip.value}`}
                    type="button"
                    onClick={() => dropChip(chip)}
                    title={`Remove the ${chip.kind} filter and search more widely`}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                  >
                    <span className="uppercase opacity-60">{chip.kind}</span>
                    {chip.label}
                    <span aria-hidden>×</span>
                  </button>
                ))
              : null}

            {searching || selection.path ? (
              <button
                type="button"
                onClick={() => { onSearchChange(''); setSelection(EMPTY_SELECTION); }}
                title="Clear the search and the selected category, showing every document"
                className="text-xs text-primary hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>

          {view === 'list' ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>{visible.length} document{visible.length === 1 ? '' : 's'}</CardTitle>
                <ViewToggle view={view} onChange={changeView} />
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  rows={visible}
                  getRowId={(row) => row.document_id}
                  loading={loading}
                  loadingMessage="Loading documents..."
                  emptyMessage={emptyMessage}
                  minWidth="1080px"
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-foreground">
                  {visible.length} document{visible.length === 1 ? '' : 's'}
                </span>
                <ViewToggle view={view} onChange={changeView} />
              </div>
              <DocumentGrid
                documents={visible}
                user={user}
                loading={loading}
                emptyMessage={emptyMessage}
                onEdit={openEdit}
                onMove={setMoving}
                onDelete={remove}
              />
            </>
          )}
        </div>
      </div>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        editing={editing}
        defaults={uploadDefaults}
        tags={tags}
        onTagsChanged={() => { void loadTags(); }}
        onSaved={(saved) => setDocuments((current) => upsertById(current, saved, 'document_id'))}
      />

      <MoveDocumentDialog
        open={moving !== null}
        onOpenChange={(next) => { if (!next) setMoving(null); }}
        document={moving}
        onMoved={(moved) => setDocuments((current) => upsertById(current, moved, 'document_id'))}
      />

      <AskDialog
        open={askOpen}
        onOpenChange={onAskOpenChange}
        documents={documents}
        onFallbackToSearch={(question) => onSearchChange(question)}
        onOpenDocument={(doc) => {
          // Jump to where the document is filed so the surrounding issuances are visible too.
          onSearchChange('');
          setSelection({ path: doc.category_path, year: doc.year, month: doc.month || '' });
        }}
      />
    </main>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (next: ViewMode) => void }) {
  const options: { value: ViewMode; icon: typeof List; label: string }[] = [
    { value: 'list', icon: List, label: 'List view' },
    { value: 'grid', icon: LayoutGrid, label: 'Grid view' },
  ];
  return (
    <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5">
      {options.map((option) => {
        const active = view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full p-1.5 transition',
              active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <option.icon className="h-4 w-4" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
