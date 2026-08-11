import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import type { DocumentUploadPayload, LibraryDocument, Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { leafPaths, levelsForPath, MONTHS, yearOptions } from '@/lib/categories';
import { formatFileSize, joinTags, parseTags, readFileAsBase64 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ButtonSpinner } from '@/components/ui/Spinner';
import { TagPicker } from '@/components/TagPicker';
import { TagCreateDialog } from '@/components/TagCreateDialog';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';

type FormState = {
  name: string;
  category_path: string;
  year: string;
  month: string;
  tags: string[];
  remarks: string;
};

const EMPTY_FORM: FormState = { name: '', category_path: '', year: '', month: '', tags: [], remarks: '' };

export function UploadDocumentDialog({
  open,
  onOpenChange,
  editing,
  defaults,
  tags,
  onTagsChanged,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits an existing document's metadata instead of uploading a new file. */
  editing?: LibraryDocument | null;
  /** Pre-fills the filing location from whatever the user has selected in the sidebar. */
  defaults?: { category_path?: string; year?: string; month?: string };
  tags: Tag[];
  onTagsChanged: () => void;
  onSaved: (document: LibraryDocument) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => leafPaths(), []);
  const years = useMemo(() => yearOptions(), []);
  const needsMonth = levelsForPath(form.category_path).includes('month');

  useEffect(() => {
    if (!open) return;
    setError('');
    setNotice('');
    setSaving(false);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (editing) {
      setForm({
        name: editing.name,
        category_path: editing.category_path,
        year: editing.year,
        month: editing.month || '',
        tags: parseTags(editing.tags),
        remarks: editing.remarks || '',
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        category_path: defaults?.category_path || '',
        year: defaults?.year || '',
        month: defaults?.month || '',
      });
    }
  }, [open, editing, defaults?.category_path, defaults?.year, defaults?.month]);

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function onPickFile(selected: File | null) {
    setError('');
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(`"${selected.name}" is ${formatFileSize(selected.size)}. Maximum upload size is 15 MB.`);
      return;
    }
    setFile(selected);
    // Default the document name to the file name (minus extension) when the user hasn't typed one.
    setForm((current) => current.name.trim()
      ? current
      : { ...current, name: selected.name.replace(/\.[^.]+$/, '') });
  }

  function validate(): string {
    if (!form.name.trim()) return 'Name is required.';
    if (!editing && !file) return 'Browse and select a file to upload.';
    if (!form.category_path) return 'Category is required.';
    if (!form.year) return 'Year is required.';
    if (needsMonth && !form.month) return 'Month is required for this category.';
    return '';
  }

  async function save(saveAnother: boolean) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: DocumentUploadPayload = {
        document_id: editing?.document_id,
        name: form.name.trim(),
        category_path: form.category_path,
        year: form.year,
        month: needsMonth ? form.month : '',
        tags: joinTags(form.tags),
        remarks: form.remarks.trim(),
      };
      if (file) {
        payload.file_base64 = await readFileAsBase64(file);
        payload.file_name = file.name;
        payload.mime_type = file.type || 'application/octet-stream';
        payload.file_size = file.size;
      }

      const saved = await api.saveDocument(payload);
      onSaved(saved);

      if (saveAnother) {
        // Keep the filing context — category, year, month, tags and remarks — and clear only the
        // name and file, because staff upload a run of documents into the same folder in one
        // sitting and the remark usually applies to the whole batch.
        setForm((current) => ({ ...current, name: '' }));
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setNotice(`Saved "${saved.name}". Everything except the name and file is kept for the next document.`);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the document.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
        <DialogContent
          title={editing ? 'Edit Document' : 'Upload Document'}
          description={editing ? 'Update the details of this document. Choose a new file only if you are replacing it.' : 'Files are stored in the OSDS E-Library Drive folder, filed under the category and year you choose.'}
          className="w-[min(96vw,720px)]"
        >
          <div className="space-y-4 p-6">
            {error ? <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
            {notice ? <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

            <FieldLabel label="Name *">
              <Input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. CMO No. 01 s. 2026 — Revised Policies on Student Affairs and Services"
                disabled={saving}
              />
            </FieldLabel>

            <FieldLabel label={editing ? 'Browse file (optional — replaces the current file)' : 'Browse file *'}>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  disabled={saving}
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-accent file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-foreground/90 hover:file:bg-border disabled:cursor-not-allowed disabled:bg-muted"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {file
                  ? `Selected: ${file.name} (${formatFileSize(file.size)})`
                  : editing?.file_name
                  ? `Current file: ${editing.file_name}`
                  : 'PDF, Word, Excel, or image. Maximum 15 MB.'}
              </p>
            </FieldLabel>

            <div className={needsMonth ? 'grid gap-4 md:grid-cols-[1fr_140px_160px]' : 'grid gap-4 md:grid-cols-[1fr_160px]'}>
              <FieldLabel label="Category *">
                <Select
                  value={form.category_path}
                  onChange={(e) => patch({ category_path: e.target.value, month: '' })}
                  placeholder="Select a category"
                  disabled={saving}
                >
                  {categories.map((category) => (
                    <option key={category.path} value={category.path}>{category.label}</option>
                  ))}
                </Select>
              </FieldLabel>

              <FieldLabel label="Year *">
                <Select value={form.year} onChange={(e) => patch({ year: e.target.value })} placeholder="Year" disabled={saving}>
                  {years.map((year) => <option key={year} value={year}>{year}</option>)}
                </Select>
              </FieldLabel>

              {needsMonth ? (
                <FieldLabel label="Month *">
                  <Select value={form.month} onChange={(e) => patch({ month: e.target.value })} placeholder="Month" disabled={saving}>
                    {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </FieldLabel>
              ) : null}
            </div>

            <FieldLabel label="Tags">
              <TagPicker
                tags={tags}
                selected={form.tags}
                onChange={(next) => patch({ tags: next })}
                onCreateTag={() => setTagDialogOpen(true)}
                disabled={saving}
              />
            </FieldLabel>

            <FieldLabel label="Remarks">
              <Textarea
                rows={3}
                value={form.remarks}
                onChange={(e) => patch({ remarks: e.target.value })}
                placeholder="Optional notes — e.g. what this document supersedes."
                disabled={saving}
              />
            </FieldLabel>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-muted p-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving} title="Discard this upload and close">Cancel</Button>
            {editing ? null : (
              <Button
                type="button"
                variant="outline"
                onClick={() => save(true)}
                disabled={saving}
                title="Save and stay here — the category, year, tags, and remarks are kept for the next document, so a batch can be filed one after another"
              >
                {saving ? <ButtonSpinner label="Saving..." /> : <><FileUp className="h-4 w-4" /> Save Another</>}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              title={editing ? 'Save the changes and close' : 'Save this document and close'}
            >
              {saving ? <ButtonSpinner label="Saving..." /> : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TagCreateDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        onSaved={(tag) => {
          onTagsChanged();
          // Auto-select the tag that was just created — it was created for this document.
          setForm((current) => current.tags.some((name) => name.toLowerCase() === tag.name.toLowerCase())
            ? current
            : { ...current, tags: [...current.tags, tag.name] });
        }}
      />
    </>
  );
}
