import { useEffect, useState } from 'react';
import type { Tag } from '@/types';
import { api } from '@/lib/gasClient';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input, Textarea } from '@/components/ui/input';
import { ButtonSpinner } from '@/components/ui/Spinner';

/**
 * Create/rename a tag. Opened from the "+ New Tag" button beside the Tags field in the upload
 * dialog, and from Settings > Tags. On success the new tag is handed back so the caller can both
 * refresh its list and auto-select it.
 */
export function TagCreateDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Tag | null;
  onSaved: (tag: Tag) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setDescription(editing?.description || '');
    setError('');
    setSaving(false);
  }, [open, editing]);

  async function save() {
    if (!name.trim()) {
      setError('Tag name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveTag({ tag_id: editing?.tag_id, name: name.trim(), description: description.trim() });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the tag.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit Tag' : 'Create Tag'}
        description="Tags are shared across the whole library. Renaming a tag updates every document that uses it."
        className="w-[min(96vw,560px)]"
      >
        <div className="space-y-4 p-6">
          {error ? <Callout tone="error">{error}</Callout> : null}
          <FieldLabel label="Tag Name *">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office of the Director"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
            />
          </FieldLabel>
          <FieldLabel label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional. What kind of document should carry this tag?"
            />
          </FieldLabel>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted p-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <ButtonSpinner label="Saving..." /> : editing ? 'Save Tag' : 'Create Tag'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
