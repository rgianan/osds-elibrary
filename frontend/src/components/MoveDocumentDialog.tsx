import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderInput } from 'lucide-react';
import type { LibraryDocument } from '@/types';
import { api } from '@/lib/gasClient';
import { breadcrumbLabel, leafPaths, levelsForPath, MONTHS, yearOptions } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Refiles a document without reopening the whole upload form — the common case is a correctly named
 * document that landed in the wrong category or year. The Drive file follows the change, so the
 * folder tree keeps matching the library.
 */
export function MoveDocumentDialog({
  open,
  onOpenChange,
  document: doc,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: LibraryDocument | null;
  onMoved: (moved: LibraryDocument) => void;
}) {
  const [categoryPath, setCategoryPath] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const categories = useMemo(() => leafPaths(), []);
  const years = useMemo(() => yearOptions(), []);
  const needsMonth = levelsForPath(categoryPath).includes('month');

  useEffect(() => {
    if (!open || !doc) return;
    setCategoryPath(doc.category_path);
    setYear(doc.year);
    setMonth(doc.month || '');
    setError('');
    setSaving(false);
  }, [open, doc]);

  const unchanged = !!doc
    && categoryPath === doc.category_path
    && year === doc.year
    && (needsMonth ? month : '') === (doc.month || '');

  async function move() {
    if (!doc) return;
    if (!categoryPath) { setError('Choose a destination category.'); return; }
    if (!year) { setError('Choose a year.'); return; }
    if (needsMonth && !month) { setError('This category files by month — choose one.'); return; }

    setSaving(true);
    setError('');
    try {
      const moved = await api.moveDocument(doc.document_id, categoryPath, year, needsMonth ? month : '');
      onMoved(moved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move the document.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent
        title="Move Document"
        description="Refiles the document and moves its file into the matching Drive folder."
        className="w-[min(96vw,640px)]"
      >
        <div className="space-y-4 p-6">
          {error ? <Callout tone="error">{error}</Callout> : null}

          {doc ? (
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <div className="text-sm font-semibold text-foreground">{doc.name}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
                  {breadcrumbLabel(doc.category_path, doc.year, doc.month)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {categoryPath
                    ? breadcrumbLabel(categoryPath, year, needsMonth ? month : '')
                    : 'Choose a destination'}
                </span>
              </div>
            </div>
          ) : null}

          <div className={needsMonth ? 'grid gap-4 md:grid-cols-[1fr_130px_150px]' : 'grid gap-4 md:grid-cols-[1fr_150px]'}>
            <FieldLabel label="Category *">
              <Select
                value={categoryPath}
                onChange={(e) => { setCategoryPath(e.target.value); setMonth(''); }}
                placeholder="Select a category"
                disabled={saving}
                autoFocus
                title="Where the document should be filed"
              >
                {categories.map((category) => (
                  <option key={category.path} value={category.path}>{category.label}</option>
                ))}
              </Select>
            </FieldLabel>

            <FieldLabel label="Year *">
              <Select value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" disabled={saving} title="The year this document belongs to">
                {years.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </FieldLabel>

            {needsMonth ? (
              <FieldLabel label="Month *">
                <Select value={month} onChange={(e) => setMonth(e.target.value)} placeholder="Month" disabled={saving} title="This category files by month as well as year">
                  {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </FieldLabel>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted p-4">
          {/*
            Said in plain text rather than in a tooltip on the Move button. A disabled button
            takes no pointer events, so a tip attached to it can never open — the one moment
            the explanation is needed is the one moment it would be unreachable.
          */}
          {unchanged && !saving ? (
            <span className="mr-auto text-xs text-muted-foreground">
              Pick a different category, year, or month to enable Move.
            </span>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Tooltip content="Refile the document and move its Drive file to match">
            <Button type="button" onClick={move} disabled={saving || unchanged}>
              {saving ? <ButtonSpinner label="Moving..." /> : <><FolderInput className="h-4 w-4" /> Move</>}
            </Button>
          </Tooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
