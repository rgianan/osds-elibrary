import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const MANILA_TIME_ZONE = 'Asia/Manila';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

export function toDisplayDate(value?: string) {
  if (!value) return '';
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[2]}/${dateOnly[3]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: MANILA_TIME_ZONE });
}

/** Comma-separated tag string -> trimmed, de-duplicated list. */
export function parseTags(value?: string): string[] {
  const seen = new Set<string>();
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function joinTags(tags: string[]) {
  return tags.join(', ');
}

export function formatFileSize(bytes: number | string | undefined) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File into the base64 payload the Apps Script backend expects. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // strip the "data:<mime>;base64," prefix — the backend wants raw base64
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
