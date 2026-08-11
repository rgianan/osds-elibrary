import { Download, FolderInput, Pencil, Trash2 } from 'lucide-react';
import type { CurrentUser, LibraryDocument } from '@/types';
import { displayPath, monthLabel } from '@/lib/categories';
import { fileKindFor } from '@/lib/fileKind';
import { canModifyDocument } from '@/lib/permissions';
import { formatFileSize, parseTags, toDisplayDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TagChip } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/Spinner';

/**
 * Card view of the same documents the table shows. Each card leads with an icon coloured by file
 * type — red for PDF, blue for Word, green for Excel, violet for images — so the eye can sort a
 * folder of scans from a folder of spreadsheets before reading a single title.
 */
export function DocumentGrid({
  documents,
  user,
  loading,
  emptyMessage,
  onEdit,
  onMove,
  onDelete,
}: {
  documents: LibraryDocument[];
  user: CurrentUser;
  loading?: boolean;
  emptyMessage: React.ReactNode;
  onEdit: (doc: LibraryDocument) => void;
  onMove: (doc: LibraryDocument) => void;
  onDelete: (doc: LibraryDocument) => void;
}) {
  if (loading) {
    return (
      <div className="el-card el-themed p-10">
        <LoadingState message="Loading documents..." />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="el-card el-themed p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    // Column count climbs with the viewport so a 1080p or wider screen shows more per row rather
    // than stretching a few cards across dead space.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2000px]:grid-cols-5">
      {documents.map((doc) => {
        const kind = fileKindFor(doc.file_name, doc.mime_type);
        const Icon = kind.icon;
        const tags = parseTags(doc.tags);
        const canModify = canModifyDocument(user, doc.uploaded_by);

        return (
          <article
            key={doc.document_id}
            className="el-card el-themed group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:[box-shadow:0_4px_12px_hsl(var(--shadow-color)/0.1),0_2px_4px_hsl(var(--shadow-color)/0.06)]"
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${kind.className}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={doc.name}>
                  {doc.name}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={doc.file_name}>
                  {kind.label}
                  {formatFileSize(doc.file_size) ? ` · ${formatFileSize(doc.file_size)}` : ''}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              <span className="text-foreground/80">{displayPath(doc.category_path)}</span>
              <br />
              <span className="tabular-nums">
                {doc.year}
                {doc.month ? ` · ${monthLabel(doc.month)}` : ''}
              </span>
            </p>

            {doc.remarks ? (
              <p className="mt-2 line-clamp-2 text-xs italic text-muted-foreground" title={doc.remarks}>
                {doc.remarks}
              </p>
            ) : null}

            {tags.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag) => <TagChip key={tag} label={tag} />)}
                {tags.length > 3 ? (
                  <span className="self-center text-[11px] text-muted-foreground">+{tags.length - 3}</span>
                ) : null}
              </div>
            ) : null}

            {/* Uploader and date on one line — see the same pairing in the table's Uploaded By column. */}
            <p className="mt-3 truncate border-t border-border pt-3 text-xs text-muted-foreground">
              {doc.uploaded_by_name || doc.uploaded_by} · {toDisplayDate(doc.date_uploaded)}
            </p>

            <div className="mt-3 flex gap-2">
              <a
                href={doc.file_url || '#'}
                target="_blank"
                rel="noreferrer"
                title={`Open ${doc.file_name} in a new tab`}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" />
                Open
              </a>
              {canModify ? (
                <>
                  <Button type="button" size="icon" variant="outline" onClick={() => onEdit(doc)} title="Edit this document's name, tags, or remarks">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => onMove(doc)} title="Move to a different category or year — the Drive file follows">
                    <FolderInput className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="danger" onClick={() => onDelete(doc)} title="Delete this document and its file from Drive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
