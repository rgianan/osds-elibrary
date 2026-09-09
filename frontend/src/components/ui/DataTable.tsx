import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

export type Column<T> = {
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

type IconComponent = ComponentType<{ className?: string }>;

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  /**
   * A load failure, so the table can tell "there is nothing" apart from "nothing arrived". Pass the
   * error from the read itself, not from an action — an empty table after a failed read must not
   * claim the collection is empty.
   */
  error?: string;
  emptyMessage?: ReactNode;
  emptyIcon?: IconComponent;
  loadingMessage?: string;
  /** Placeholder rows drawn while loading. Set close to a typical page so the height barely shifts. */
  skeletonRows?: number;
  minWidth?: string;
  bordered?: boolean;
};

/**
 * Placeholder cells keep the column rhythm of real content — a wide first column, narrow trailing
 * ones — so the loading table has the same shape as the loaded one and nothing jumps on arrival.
 */
const SKELETON_WIDTHS = ['w-[70%]', 'w-[55%]', 'w-[40%]', 'w-[60%]', 'w-[45%]'];

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  emptyMessage = 'No data available.',
  emptyIcon,
  loadingMessage = 'Loading...',
  skeletonRows = 6,
  minWidth,
  bordered = true,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-auto', bordered && 'rounded-md border border-border')}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }} aria-busy={loading || undefined}>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-muted-foreground">
            {columns.map((col, i) => (
              <th key={i} className={cn('p-3 text-left text-xs font-semibold uppercase tracking-wide', col.headerClassName)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-border/60 last:border-b-0">
                  {columns.map((_col, i) => (
                    <td key={i} className="p-3">
                      <Skeleton className={cn('h-4', SKELETON_WIDTHS[(rowIndex + i) % SKELETON_WIDTHS.length])} />
                    </td>
                  ))}
                </tr>
              ))
            : null}
          {loading ? (
            <tr>
              {/* The placeholder rows are decoration; this is what a screen reader is told instead. */}
              <td colSpan={columns.length} className="sr-only" role="status">{loadingMessage}</td>
            </tr>
          ) : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {error ? (
                  <EmptyState
                    icon={AlertTriangle}
                    message="This list could not be loaded, so nothing is shown. The message above has the details — it is not a sign that the list is empty."
                  />
                ) : (
                  <EmptyState icon={emptyIcon} message={emptyMessage} />
                )}
              </td>
            </tr>
          ) : null}
          {rows.map((row, rowIndex) => (
            <tr key={getRowId(row)} className="border-b border-border/60 transition hover:bg-accent/50 last:border-b-0">
              {columns.map((col, i) => (
                <td key={i} className={cn('p-3 text-foreground/90', col.cellClassName)}>
                  {col.render(row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type DataTableCardProps<T> = DataTableProps<T> & {
  title: ReactNode;
  titleIcon?: IconComponent;
  actions?: ReactNode;
  search?: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    width?: string;
    icon?: IconComponent;
  };
};

export function DataTableCard<T>({
  title,
  titleIcon: Icon,
  search,
  actions,
  ...tableProps
}: DataTableCardProps<T>) {
  const SearchIcon = search?.icon || Search;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className={Icon ? 'flex items-center gap-2' : undefined}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {search ? (
            <div className="relative" style={{ width: search.width || '360px' }}>
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
              />
            </div>
          ) : null}
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable {...tableProps} />
      </CardContent>
    </Card>
  );
}
