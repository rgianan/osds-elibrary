import type { ComponentType, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/Spinner';
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
  emptyMessage?: ReactNode;
  loadingMessage?: string;
  minWidth?: string;
  bordered?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  emptyMessage = 'No data available.',
  loadingMessage = 'Loading...',
  minWidth,
  bordered = true,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-auto', bordered && 'rounded-md border border-border')}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
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
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-8">
                <LoadingState message={loadingMessage} />
              </td>
            </tr>
          ) : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
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
