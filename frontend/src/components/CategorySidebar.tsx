import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Library } from 'lucide-react';
import { CATEGORY_TREE, MONTHS, isWithinPath, joinPath, levelsForPath, type CategoryNode } from '@/lib/categories';
import { cn } from '@/lib/utils';

export type LibrarySelection = {
  /** Slash-joined category path. Empty string means "everything". */
  path: string;
  year: string;
  month: string;
};

type Props = {
  selection: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
  years: string[];
  /** document counts keyed by `path|year|month` prefix, used for the badge next to each node */
  countFor: (selection: LibrarySelection) => number;
};

const ROW_BASE = 'flex w-full items-center gap-2 border-l-2 py-2 pr-3 text-left text-sm transition';
const ROW_ACTIVE = 'border-primary bg-primary/10 font-semibold text-primary';
const ROW_IDLE = 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground';

/** Hover hint for a tree row: what it holds, and what clicking will do. */
function rowTitle(label: string, count: number, action: string) {
  const documents = count === 1 ? '1 document' : `${count} documents`;
  return `${label} — ${documents}. ${action}`;
}

export function CategorySidebar({ selection, onSelect, years, countFor }: Props) {
  return (
    // Fluid inside the mobile drawer so it cannot overflow its wrapper and leave a sliver on
    // screen when translated away; a fixed column from `lg` up.
    <aside className="el-card el-themed w-full shrink-0 self-start overflow-hidden py-2 lg:w-[310px]">
      <div className="flex items-center gap-2 px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Library className="h-3.5 w-3.5" />
        Categories
      </div>
      <button
        type="button"
        onClick={() => onSelect({ path: '', year: '', month: '' })}
        title={rowTitle('All Documents', countFor({ path: '', year: '', month: '' }), 'Click to clear any category filter.')}
        className={cn(ROW_BASE, 'pl-4', !selection.path ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span className="min-w-0 flex-1">All Documents</span>
        <Count value={countFor({ path: '', year: '', month: '' })} />
      </button>
      <div className="my-1 border-t border-border" />
      {CATEGORY_TREE.map((node) => (
        <TreeNode
          key={node.label}
          node={node}
          trail={[]}
          depth={0}
          selection={selection}
          onSelect={onSelect}
          years={years}
          countFor={countFor}
        />
      ))}
    </aside>
  );
}

function TreeNode({
  node,
  trail,
  depth,
  selection,
  onSelect,
  years,
  countFor,
}: {
  node: CategoryNode;
  trail: string[];
  depth: number;
} & Omit<Props, never>) {
  const path = joinPath([...trail, node.label]);
  const hasChildren = !!node.children?.length;
  const onSelectedBranch = !!selection.path && isWithinPath(selection.path, path);
  // null means "follow the selection", so the branch holding the current selection opens on its
  // own — but an explicit click still wins, which is what lets the user collapse that branch.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open === null ? onSelectedBranch : open;
  const isSelected = selection.path === path && !selection.year;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(!expanded);
          if (!hasChildren) onSelect({ path, year: '', month: '' });
        }}
        title={rowTitle(
          node.label,
          countFor({ path, year: '', month: '' }),
          hasChildren
            ? (expanded ? 'Click to collapse its subcategories.' : 'Click to see its subcategories.')
            : 'Click to browse it, or expand a year below.',
        )}
        className={cn(ROW_BASE, isSelected ? ROW_ACTIVE : ROW_IDLE)}
        style={{ paddingLeft: `${16 + depth * 14}px` }}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
        {expanded ? <FolderOpen className="h-4 w-4 shrink-0 opacity-70" /> : <Folder className="h-4 w-4 shrink-0 opacity-70" />}
        <span className="min-w-0 flex-1 leading-5">{node.label}</span>
        <Count value={countFor({ path, year: '', month: '' })} />
      </button>

      {expanded && hasChildren
        ? node.children!.map((child) => (
            <TreeNode
              key={child.label}
              node={child}
              trail={[...trail, node.label]}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              years={years}
              countFor={countFor}
            />
          ))
        : null}

      {expanded && !hasChildren ? (
        <YearList path={path} depth={depth + 1} selection={selection} onSelect={onSelect} years={years} countFor={countFor} />
      ) : null}
    </div>
  );
}

function YearList({
  path,
  depth,
  selection,
  onSelect,
  years,
  countFor,
}: { path: string; depth: number } & Omit<Props, never>) {
  const hasMonths = levelsForPath(path).includes('month');
  // Only the years that actually hold documents, with an explicit toggle for the full 1994..now
  // range so empty years stay reachable for filing. A category with nothing in it therefore shows
  // just the toggle rather than dumping three decades of empty years.
  const [showAll, setShowAll] = useState(false);
  const populated = years.filter((year) => countFor({ path, year, month: '' }) > 0);
  const visible = showAll ? years : populated;

  return (
    <div>
      {visible.map((year) => (
        <YearRow
          key={year}
          path={path}
          year={year}
          depth={depth}
          hasMonths={hasMonths}
          selection={selection}
          onSelect={onSelect}
          countFor={countFor}
        />
      ))}
      {!showAll && populated.length === 0 ? (
        <div className="py-1 pr-3 text-xs italic text-muted-foreground" style={{ paddingLeft: `${16 + depth * 14}px` }}>
          No documents yet
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        title={showAll
          ? 'Hide empty years and list only those holding documents'
          : 'List every year back to 1994, including empty ones, so a document can be filed there'}
        className="w-full py-1.5 pr-3 text-left text-xs font-medium text-primary transition hover:underline"
        style={{ paddingLeft: `${16 + depth * 14}px` }}
      >
        {showAll ? 'Show years with documents' : `Show all years (${years[years.length - 1]}–${years[0]})`}
      </button>
    </div>
  );
}

function YearRow({
  path,
  year,
  depth,
  hasMonths,
  selection,
  onSelect,
  countFor,
}: {
  path: string;
  year: string;
  depth: number;
  hasMonths: boolean;
  selection: LibrarySelection;
  onSelect: Props['onSelect'];
  countFor: Props['countFor'];
}) {
  const onSelectedBranch = selection.path === path && selection.year === year;
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = hasMonths && (open === null ? onSelectedBranch : open);
  const isSelected = onSelectedBranch && !selection.month;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasMonths) setOpen(!expanded);
          onSelect({ path, year, month: '' });
        }}
        title={rowTitle(year, countFor({ path, year, month: '' }), hasMonths ? 'Click to browse the year and list its months.' : 'Click to browse this year.')}
        className={cn(ROW_BASE, 'py-1.5', isSelected ? ROW_ACTIVE : ROW_IDLE)}
        style={{ paddingLeft: `${16 + depth * 14}px` }}
      >
        {hasMonths
          ? (expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />)
          : <span className="w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 tabular-nums">{year}</span>
        <Count value={countFor({ path, year, month: '' })} />
      </button>

      {expanded
        ? MONTHS.map(([value, label]) => {
            const selected = selection.path === path && selection.year === year && selection.month === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect({ path, year, month: value })}
                title={rowTitle(`${label} ${year}`, countFor({ path, year, month: value }), 'Click to browse this month.')}
                className={cn(ROW_BASE, 'py-1.5', selected ? ROW_ACTIVE : ROW_IDLE)}
                style={{ paddingLeft: `${16 + (depth + 1) * 14}px` }}
              >
                <span className="w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{label}</span>
                <Count value={countFor({ path, year, month: value })} />
              </button>
            );
          })
        : null}
    </div>
  );
}

function Count({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}
