import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSearch, FolderInput, LayoutGrid, List, PanelLeftClose, PanelLeftOpen, Pencil, Search, Trash2, Upload } from 'lucide-react';
import type { CurrentUser, LibraryDocument, Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { CACHE_KEYS } from '@/lib/cache';
import { useResource } from '@/lib/useResource';
import { breadcrumbLabel, displayPath, isLeafPath, isWithinPath, joinPath, monthLabel, splitPath, yearOptions } from '@/lib/categories';
import { fileKindFor } from '@/lib/fileKind';
import { canModifyDocument } from '@/lib/permissions';
import { removeById, upsertById } from '@/lib/collection';
import { parseQuery, removeChip, searchDocuments, type QueryChip } from '@/lib/search';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { formatFileSize, parseTags, toDisplayDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/Spinner';
import { TagChip } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { CategorySidebar, type LibrarySelection } from '@/components/CategorySidebar';
import { DocumentGrid } from '@/components/DocumentGrid';
import { UploadDocumentDialog } from '@/components/UploadDocumentDialog';
import { MoveDocumentDialog } from '@/components/MoveDocumentDialog';
import { AskDialog } from '@/components/AskDialog';
import { cn } from '@/lib/utils';

const EMPTY_SELECTION: LibrarySelection = { path: '', year: '', month: '' };
/** Stable identities, so a cache miss does not invalidate every downstream `useMemo`. */
const NO_DOCUMENTS: LibraryDocument[] = [];
const NO_TAGS: Tag[] = [];

type ViewMode = 'list' | 'grid';
const VIEW_STORAGE_KEY = 'elibrary-view';

const PAGE_SIZES = [25, 50, 75, 100];
const PAGE_SIZE_STORAGE_KEY = 'elibrary-page-size';

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function readStoredPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return PAGE_SIZES.includes(stored) ? stored : PAGE_SIZES[0];
  } catch {
    return PAGE_SIZES[0];
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
  /**
   * Both lists come from the shared cache: a return trip from Settings paints from memory and
   * re-reads behind the content, instead of blanking the table for another round trip to Apps
   * Script. `mutate` writes back through the cache, which is what makes an optimistic delete here
   * visible to the Tags page's usage counts as well.
   */
  const docsResource = useResource<LibraryDocument[]>(
    CACHE_KEYS.documents,
    () => api.listDocuments(),
    { fallbackMessage: 'Failed to load the library.' },
  );
  // The tag vocabulary is non-critical for browsing, so its failure is not surfaced as a page error.
  const tagsResource = useResource<Tag[]>(CACHE_KEYS.tags, () => api.listTags());

  const documents = docsResource.data ?? NO_DOCUMENTS;
  const tags = tagsResource.data ?? NO_TAGS;
  const loading = docsResource.loading;
  // Only "refreshing" once something is on screen — before that it is just the first load.
  const refreshing = docsResource.refreshing && !docsResource.loading;

  const [selection, setSelection] = useState<LibrarySelection>(EMPTY_SELECTION);
  // Kept apart from the load error so a failed delete does not vanish on the next background read.
  const [actionError, setActionError] = useState('');
  const error = docsResource.error || actionError;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [moving, setMoving] = useState<LibraryDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument | null>(null);
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [pageSize, setPageSize] = useState<number>(readStoredPageSize);
  const [page, setPage] = useState(0);

  function changePageSize(next: number) {
    setPageSize(next);
    setPage(0);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
    } catch {
      /* the choice simply will not persist */
    }
  }

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

  /**
   * The row leaves the table on click rather than after the round trip. A delete that fails puts it
   * back exactly where it was — which is why the whole list is snapshotted rather than just the row,
   * since restoring one row would lose its position in the sort.
   */
  const remove = useCallback(async (row: LibraryDocument) => {
    setPendingDelete(null);
    setActionError('');
    const snapshot = docsResource.data ?? NO_DOCUMENTS;
    docsResource.mutate(removeById(snapshot, row.document_id, 'document_id'));
    try {
      await api.deleteDocument(row.document_id);
    } catch (err) {
      docsResource.mutate(snapshot);
      setActionError(err instanceof Error ? err.message : 'Failed to delete the document.');
    }
  }, [docsResource]);

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

  // Any change to what is being listed starts again at the first page — staying on page 4 of a
  // result set that now has two pages would just show an empty table.
  useEffect(() => { setPage(0); }, [selection, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamped rather than trusted: deleting the last document on a page shrinks the result set
  // underneath the current page number.
  const safePage = Math.min(page, pageCount - 1);
  const firstShown = visible.length === 0 ? 0 : safePage * pageSize + 1;
  const lastShown = Math.min((safePage + 1) * pageSize, visible.length);
  const pageItems = useMemo(
    () => visible.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [visible, safePage, pageSize],
  );

  // The zero case is only reported once it is a fact. While the skeleton rows are up the count is
  // zero merely because nothing has arrived, and "No documents" above them would be a lie.
  const countLabel = loading
    ? 'Loading documents...'
    : docsResource.error && !docsResource.data
    ? 'Documents'
    : visible.length === 0
    ? 'No documents'
    : visible.length <= pageSize
    ? `${visible.length.toLocaleString()} document${visible.length === 1 ? '' : 's'}`
    : `Showing ${firstShown.toLocaleString()}–${lastShown.toLocaleString()} of ${visible.length.toLocaleString()}`;

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
          <Tooltip content={`Open ${row.file_name} in a new tab`} asLabel>
            <a
              href={row.file_url || '#'}
              target="_blank"
              rel="noreferrer"
              className="el-focus inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:border-primary hover:text-primary"
            >
              <Download className="h-4 w-4" />
            </a>
          </Tooltip>
          {canModifyDocument(user, row.uploaded_by) ? (
            <>
              <Tooltip content="Edit this document's name, tags, or remarks" asLabel>
                <Button type="button" size="icon" variant="outline" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
              </Tooltip>
              <Tooltip content="Move to a different category or year — the Drive file follows" asLabel>
                <Button type="button" size="icon" variant="outline" onClick={() => setMoving(row)}><FolderInput className="h-4 w-4" /></Button>
              </Tooltip>
              <Tooltip content="Delete this document and its file from Drive" asLabel>
                <Button type="button" size="icon" variant="danger" onClick={() => setPendingDelete(row)}><Trash2 className="h-4 w-4" /></Button>
              </Tooltip>
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
        <Tooltip content="Add a document to the library — PDF, Word, Excel, or image, up to 15 MB">
          <Button onClick={openUpload} className="shrink-0">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">UPLOAD DOCUMENT</span>
            <span className="sm:hidden">UPLOAD</span>
          </Button>
        </Tooltip>
      </div>

      {error ? <Callout tone="error" className="mb-4">{error}</Callout> : null}

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
            <Tooltip content={sidebarOpen ? 'Hide the category rail' : 'Show the category rail'}>
              <button
                type="button"
                onClick={() => setSidebarOpen((value) => !value)}
                aria-expanded={sidebarOpen}
                className="el-focus inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                Categories
              </button>
            </Tooltip>
            {searching ? <Search className="h-4 w-4 text-muted-foreground" /> : null}
            <span className="font-medium text-foreground">{heading}</span>

            {searching
              ? parsed.chips.map((chip) => (
                  <Tooltip key={`${chip.kind}-${chip.value}`} content={`Remove the ${chip.kind} filter and search more widely`}>
                    <button
                      type="button"
                      onClick={() => dropChip(chip)}
                      className="el-focus inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                    >
                      <span className="uppercase opacity-60">{chip.kind}</span>
                      {chip.label}
                      <span aria-hidden>×</span>
                    </button>
                  </Tooltip>
                ))
              : null}

            {searching || selection.path ? (
              <Tooltip content="Clear the search and the selected category, showing every document">
                <button
                  type="button"
                  onClick={() => { onSearchChange(''); setSelection(EMPTY_SELECTION); }}
                  className="el-focus rounded px-1 text-xs text-primary hover:underline"
                >
                  Clear
                </button>
              </Tooltip>
            ) : null}
          </div>

          {view === 'list' ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  {countLabel}
                  <RefreshHint active={refreshing} />
                </CardTitle>
                <div className="flex items-center gap-2">
                  <PageSizeSelect value={pageSize} onChange={changePageSize} />
                  <ViewToggle view={view} onChange={changeView} />
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  rows={pageItems}
                  getRowId={(row) => row.document_id}
                  loading={loading}
                  error={docsResource.error}
                  loadingMessage="Loading documents..."
                  skeletonRows={Math.min(pageSize, 8)}
                  emptyMessage={emptyMessage}
                  emptyIcon={FileSearch}
                  minWidth="1080px"
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {countLabel}
                  <RefreshHint active={refreshing} />
                </span>
                <div className="flex items-center gap-2">
                  <PageSizeSelect value={pageSize} onChange={changePageSize} />
                  <ViewToggle view={view} onChange={changeView} />
                </div>
              </div>
              <DocumentGrid
                documents={pageItems}
                user={user}
                loading={loading}
                error={docsResource.error}
                emptyMessage={emptyMessage}
                onEdit={openEdit}
                onMove={setMoving}
                onDelete={setPendingDelete}
              />
            </>
          )}

          {!loading && pageCount > 1 ? (
            <nav className="mt-3 flex flex-wrap items-center justify-end gap-2" aria-label="Document pages">
              <span className="text-xs tabular-nums text-muted-foreground">Page {safePage + 1} of {pageCount}</span>
              <Tooltip content={`Show documents ${Math.max(1, (safePage - 1) * pageSize + 1)}–${safePage * pageSize}`}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
              </Tooltip>
              <Tooltip content={`Show documents ${lastShown + 1}–${Math.min(lastShown + pageSize, visible.length)}`}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage + 1 >= pageCount}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </Tooltip>
            </nav>
          ) : null}
        </div>
      </div>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        editing={editing}
        defaults={uploadDefaults}
        tags={tags}
        onTagsChanged={() => { void tagsResource.reload(); }}
        onSaved={(saved) => docsResource.mutate((current) => upsertById(current ?? NO_DOCUMENTS, saved, 'document_id'))}
      />

      <MoveDocumentDialog
        open={moving !== null}
        onOpenChange={(next) => { if (!next) setMoving(null); }}
        document={moving}
        onMoved={(moved) => docsResource.mutate((current) => upsertById(current ?? NO_DOCUMENTS, moved, 'document_id'))}
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => { if (!next) setPendingDelete(null); }}
        title="Delete document"
        confirmLabel="Delete document"
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      >
        <p>
          Delete <span className="font-semibold">{pendingDelete?.name}</span>?
        </p>
        <p className="mt-2 text-muted-foreground">
          The file is also removed from the E-Library Drive folder. This cannot be undone from here.
        </p>
      </ConfirmDialog>
    </main>
  );
}

/**
 * Shown only while a re-read runs behind content that is already on screen. Deliberately small and
 * unlabelled: the list is usable throughout, so this reports activity without implying a wait.
 */
function RefreshHint({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <Tooltip content="Checking for changes">
      <span className="inline-flex items-center">
        <Spinner size="sm" label="Refreshing" className="h-3 w-3 border" />
      </span>
    </Tooltip>
  );
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Show</span>
      <Tooltip content="How many documents to show per page">
        <Select
          className="h-8 w-[4.5rem] text-xs"
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Documents per page"
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </Select>
      </Tooltip>
    </label>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (next: ViewMode) => void }) {
  const options: { value: ViewMode; icon: typeof List; label: string; hint: string }[] = [
    { value: 'list', icon: List, label: 'List view', hint: 'List view — a row per document, with every column' },
    { value: 'grid', icon: LayoutGrid, label: 'Grid view', hint: 'Grid view — cards, colour-coded by file type' },
  ];
  return (
    <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5">
      {options.map((option) => {
        const active = view === option.value;
        return (
          <Tooltip key={option.value} content={option.hint}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'el-focus rounded-full p-1.5 transition',
                active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <option.icon className="h-4 w-4" />
              <span className="sr-only">{option.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
