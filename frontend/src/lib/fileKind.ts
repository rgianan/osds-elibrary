import { File, FileImage, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';

export type FileKind = {
  icon: LucideIcon;
  label: string;
  /** Icon colour, plus a tinted plate behind it. Tuned to stay legible in both themes. */
  className: string;
};

const PDF: FileKind = { icon: FileText, label: 'PDF', className: 'text-rose-600 bg-rose-500/10 dark:text-rose-400' };
const WORD: FileKind = { icon: FileText, label: 'Word', className: 'text-blue-600 bg-blue-500/10 dark:text-blue-400' };
const EXCEL: FileKind = { icon: FileSpreadsheet, label: 'Excel', className: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' };
const IMAGE: FileKind = { icon: FileImage, label: 'Image', className: 'text-violet-600 bg-violet-500/10 dark:text-violet-400' };
const OTHER: FileKind = { icon: File, label: 'File', className: 'text-muted-foreground bg-muted' };

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: PDF,
  doc: WORD,
  docx: WORD,
  xls: EXCEL,
  xlsx: EXCEL,
  png: IMAGE,
  jpg: IMAGE,
  jpeg: IMAGE,
};

/**
 * Picks the icon for a document from its file name, falling back to the MIME type — a scanned file
 * uploaded without an extension still gets the right icon.
 */
export function fileKindFor(fileName?: string, mimeType?: string): FileKind {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  const extension = dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
  if (BY_EXTENSION[extension]) return BY_EXTENSION[extension];

  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return PDF;
  if (mime.startsWith('image/')) return IMAGE;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return EXCEL;
  if (mime.includes('word') || mime.includes('document')) return WORD;
  return OTHER;
}
