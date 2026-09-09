import { Skeleton } from '@/components/ui/Skeleton';

/**
 * The first paint, before the identity and the category tree have come back from Apps Script.
 *
 * A centred spinner told the user only that something was happening; this shows the shape of what
 * is coming — a header, a category rail, a table of documents — so the app appears to be already
 * there and filling in. It is the slowest moment in the app (a cold Apps Script call runs to a
 * second or more), which is exactly where the difference is worth having.
 */
export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy>
      <span className="sr-only" role="status">Loading the OSDS E-Library...</span>

      <header className="h-14 border-b border-border bg-card">
        <div className="flex h-full items-center gap-3 px-6">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="hidden h-4 w-32 sm:block" />
          <div className="mx-4 flex min-w-0 flex-1 justify-center">
            <Skeleton className="h-9 w-full max-w-xl rounded-full" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[2200px] p-4 sm:p-6 lg:p-8">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        <div className="flex items-start gap-6">
          <div className="el-card el-themed hidden w-[310px] shrink-0 space-y-3 p-4 lg:block">
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>

          <div className="el-card el-themed min-w-0 flex-1 p-5">
            <Skeleton className="mb-4 h-4 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
