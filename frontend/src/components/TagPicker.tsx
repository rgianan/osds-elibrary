import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { Tag } from '@/types';
import { Input } from '@/components/ui/input';
import { TagChip } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

/**
 * Multi-select over the shared tag vocabulary.
 *
 * Tag creation sits inside the field itself, as a `+ New tag` row at the foot of the list — the
 * point where the user has just scanned the vocabulary and found it lacking. It is the only such
 * affordance in the upload dialog; Settings > Tags holds the same action for bulk curation.
 */
export function TagPicker({
  tags,
  selected,
  onChange,
  onCreateTag,
  disabled,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (next: string[]) => void;
  onCreateTag: () => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q) || tag.description.toLowerCase().includes(q));
  }, [tags, query]);

  function toggle(name: string) {
    const exists = selected.some((tag) => tag.toLowerCase() === name.toLowerCase());
    onChange(exists ? selected.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...selected, name]);
  }

  return (
    <div className="rounded-md border border-input bg-card">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        {selected.length === 0 ? (
          <span className="px-1 py-1 text-xs text-muted-foreground">No tags selected</span>
        ) : (
          selected.map((tag) => (
            <TagChip key={tag} label={tag} onRemove={disabled ? undefined : () => toggle(tag)} />
          ))
        )}
      </div>

      <div className="relative border-b border-border">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-9 rounded-none border-0 pl-9 focus:ring-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags..."
          disabled={disabled}
        />
      </div>

      <div className="max-h-40 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {tags.length === 0 ? 'No tags exist yet.' : `No tag matches "${query}".`}
          </div>
        ) : (
          filtered.map((tag) => {
            const isSelected = selected.some((name) => name.toLowerCase() === tag.name.toLowerCase());
            return (
              <button
                key={tag.tag_id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(tag.name)}
                title={tag.description || undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition',
                  isSelected ? 'bg-primary/5 font-medium text-primary' : 'text-foreground/90 hover:bg-muted',
                )}
              >
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', isSelected ? 'border-primary bg-primary text-white' : 'border-input')}>
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onCreateTag}
        disabled={disabled}
        title="Create a tag — it joins the shared vocabulary and is selected for this document"
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        New tag
      </button>
    </div>
  );
}
