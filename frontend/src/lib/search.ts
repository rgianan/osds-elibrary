import type { LibraryDocument } from '@/types';
import { FIRST_YEAR, MONTHS, getCategoryRecords, isWithinPath } from '@/lib/categories';
import { parseTags } from '@/lib/utils';

/**
 * The library's single search. It is keyword search over name/tags/remarks with a rules-based
 * front end: staff type the shorthand they already use on paper ("CMO 2016", "AOM 2023",
 * "CEB August 2025"), so recognised tokens are lifted out of the free text and become category /
 * year / month filters, surfaced as removable chips. Everything it touches is metadata — no PDF
 * text is read.
 */

type CategoryAlias = { tokens: string[]; path: string };

function normalize(value: string) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s./-]/gu, ' ');
}

/**
 * Splits on slashes as well as whitespace, because two categories are literally named with one:
 * "Office Order/Memorandum" and "Audit Query/Observation Memorandum". Without it, typing or pasting
 * such a name leaves "order/memorandum" as a single token matching no alias, and the search silently
 * degrades to a keyword match. Shared by the query parser and the alias builder so a category's own
 * name always tokenizes the same way the user's typing does.
 */
function tokenize(value: string): string[] {
  return String(value || '')
    .trim()
    .split(/[\s/]+/)
    .map((token) => normalize(token).trim())
    .filter(Boolean);
}

let aliasCache: { records: unknown; aliases: CategoryAlias[] } | null = null;

/**
 * Search shorthands, derived from the taxonomy the Administrator maintains rather than a hard-coded
 * list. Each category contributes its own label words plus any extra aliases stored against it, so
 * adding a category makes it searchable by name immediately — the drift that used to leave new
 * categories unreachable is gone by construction.
 *
 * Longest token sequence first, so "joint administrative order" wins over a bare
 * "administrative order" and "financial and physical report" over "report".
 */
function categoryAliases(): CategoryAlias[] {
  const records = getCategoryRecords();
  if (aliasCache && aliasCache.records === records) return aliasCache.aliases;

  const aliases: CategoryAlias[] = [];
  const add = (phrase: string, path: string) => {
    const tokens = tokenize(phrase);
    if (tokens.length) aliases.push({ tokens, path });
  };

  for (const record of records) {
    add(record.label, record.path);
    for (const extra of record.aliases.split(',')) add(extra, record.path);
  }

  aliases.sort((a, b) => b.tokens.length - a.tokens.length);
  aliasCache = { records, aliases };
  return aliases;
}

export type QueryChip =
  | { kind: 'category'; label: string; value: string; tokenIndexes: number[] }
  | { kind: 'year'; label: string; value: string; tokenIndexes: number[] }
  | { kind: 'month'; label: string; value: string; tokenIndexes: number[] }
  | { kind: 'number'; label: string; value: string; tokenIndexes: number[] };

export type ParsedQuery = {
  /** The original whitespace-separated tokens, so a chip can be removed from the raw text. */
  tokens: string[];
  chips: QueryChip[];
  categoryPath: string;
  year: string;
  month: string;
  /** The issuance number from "CMO 16 2026" or "CMO No. 16 s. 2026". Digits only, zeros stripped. */
  documentNumber: string;
  /** Tokens the parser did not claim — the actual keyword terms. */
  terms: string[];
};

/**
 * Matches an issuance number inside a document title.
 *
 * Anchored on word boundaries with optional leading zeros, so "16" finds "No. 16" and "No. 016"
 * but not "No. 160" and not the 16 inside "2016" — which is exactly the confusion a plain
 * substring search causes when someone types "CMO 16 2026".
 */
function matchesDocumentNumber(name: string, documentNumber: string) {
  return new RegExp(`\\b0*${documentNumber}\\b`).test(name);
}

/** Singularize crudely so "orders" matches the "order" alias. */
function stem(token: string) {
  return token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
}

function isYear(token: string) {
  if (!/^\d{4}$/.test(token)) return false;
  const value = Number(token);
  return value >= FIRST_YEAR && value <= new Date().getFullYear();
}

export function parseQuery(raw: string): ParsedQuery {
  // Split on slashes as well as whitespace. Two categories are literally named with one —
  // "Office Order/Memorandum", "Audit Query/Observation Memorandum" — so without this, typing or
  // pasting a category's own name leaves "order/memorandum" as a single token that matches no
  // alias, and the search silently degrades to a keyword match.
  const tokens = String(raw || '').trim().split(/[\s/]+/).filter(Boolean);
  const lower = tokens.map((token) => normalize(token).trim());
  const claimed = new Array(tokens.length).fill(false);

  const chips: QueryChip[] = [];
  let categoryPath = '';
  let year = '';
  let month = '';

  // 1) Category aliases, longest sequence first.
  for (const alias of categoryAliases()) {
    if (categoryPath) break;
    for (let i = 0; i + alias.tokens.length <= tokens.length; i++) {
      const window = lower.slice(i, i + alias.tokens.length).map(stem);
      const wanted = alias.tokens.map(stem);
      const hit = window.every((token, k) => token === wanted[k]);
      if (!hit) continue;
      const indexes = Array.from({ length: alias.tokens.length }, (_, k) => i + k);
      if (indexes.some((index) => claimed[index])) continue;
      indexes.forEach((index) => { claimed[index] = true; });
      categoryPath = alias.path;
      chips.push({ kind: 'category', label: alias.path.split('::').join(' > '), value: alias.path, tokenIndexes: indexes });
      break;
    }
  }

  // 2) Year — bare "2016", or the "s. 2016" / "series of 2016" forms used on the documents.
  for (let i = 0; i < tokens.length && !year; i++) {
    if (claimed[i]) continue;
    const bare = lower[i].replace(/[^\d]/g, '');
    if (!isYear(bare)) continue;
    const indexes = [i];
    const previous = lower[i - 1] || '';
    const twoBack = lower[i - 2] || '';
    if (previous === 's.' || previous === 's') indexes.unshift(i - 1);
    else if (previous === 'of' && twoBack === 'series') indexes.unshift(i - 2, i - 1);
    if (indexes.some((index) => index < 0 || claimed[index])) continue;
    indexes.forEach((index) => { claimed[index] = true; });
    year = bare;
    chips.push({ kind: 'year', label: bare, value: bare, tokenIndexes: indexes });
  }

  // 3) Month, for the CEB Matters year > month level.
  for (let i = 0; i < tokens.length && !month; i++) {
    if (claimed[i]) continue;
    const match = MONTHS.find(([, label]) => label.toLowerCase() === lower[i]);
    if (!match) continue;
    claimed[i] = true;
    month = match[0];
    chips.push({ kind: 'month', label: match[1], value: match[0], tokenIndexes: [i] });
  }

  // 4) Issuance number — "16", "no. 16", "#16". Deliberately after the year, so the 2026 in
  // "CMO 16 2026" is claimed as a year and only the 16 is left to be the document number.
  let documentNumber = '';
  for (let i = 0; i < tokens.length && !documentNumber; i++) {
    if (claimed[i]) continue;

    // "16" on its own, or written against the prefix as "no.16" / "no16" — a form people type often
    // enough that leaving it as a keyword term would silently return nothing.
    const attached = lower[i].match(/^nos?\.?(\d{1,4})$/);
    const digits = attached ? attached[1] : (/^\d{1,4}$/.test(lower[i]) ? lower[i] : '');
    if (!digits) continue;

    const indexes = [i];
    if (!attached) {
      const previous = lower[i - 1] || '';
      if (previous === 'no.' || previous === 'no' || previous === 'nos.') indexes.unshift(i - 1);
    }
    if (indexes.some((index) => index < 0 || claimed[index])) continue;
    indexes.forEach((index) => { claimed[index] = true; });

    documentNumber = String(Number(digits)); // strip leading zeros: "016" and "16" are the same
    chips.push({ kind: 'number', label: documentNumber, value: documentNumber, tokenIndexes: indexes });
  }

  const terms = tokens.filter((_, index) => !claimed[index]).map((token) => normalize(token).trim()).filter(Boolean);
  return { tokens, chips, categoryPath, year, month, documentNumber, terms };
}

/** Rebuilds the raw query with one chip's tokens removed, keeping the text the source of truth. */
export function removeChip(parsed: ParsedQuery, chip: QueryChip) {
  const drop = new Set(chip.tokenIndexes);
  return parsed.tokens.filter((_, index) => !drop.has(index)).join(' ');
}

const HAYSTACK_FIELDS = (doc: LibraryDocument) => ({
  name: doc.name.toLowerCase(),
  tags: parseTags(doc.tags).join(' ').toLowerCase(),
  remarks: (doc.remarks || '').toLowerCase(),
});

/**
 * Higher is better; 0 means "does not match". Name hits outrank tag hits, which outrank remarks,
 * so a document titled "CMO No. 02" beats one that merely mentions it in a remark.
 */
function scoreDocument(doc: LibraryDocument, parsed: ParsedQuery): number {
  if (parsed.categoryPath && !isWithinPath(doc.category_path, parsed.categoryPath)) return 0;
  if (parsed.year && String(doc.year) !== parsed.year) return 0;
  if (parsed.month && String(doc.month) !== parsed.month) return 0;
  if (parsed.documentNumber && !matchesDocumentNumber(doc.name, parsed.documentNumber)) return 0;
  if (parsed.terms.length === 0) return 1; // filters only, e.g. "CMO 16 2026"

  const fields = HAYSTACK_FIELDS(doc);
  const phrase = parsed.terms.join(' ');
  let score = 0;

  if (fields.name.includes(phrase)) score += 100;

  for (const term of parsed.terms) {
    const inName = fields.name.includes(term);
    const inTags = fields.tags.includes(term);
    const inRemarks = fields.remarks.includes(term);
    if (!inName && !inTags && !inRemarks) return 0; // every term must appear somewhere
    if (inName) score += 10;
    if (inTags) score += 5;
    if (inRemarks) score += 2;
  }
  return score;
}

export function searchDocuments(documents: LibraryDocument[], parsed: ParsedQuery): LibraryDocument[] {
  return documents
    .map((doc) => ({ doc, score: scoreDocument(doc, parsed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.doc.year !== b.doc.year) return Number(b.doc.year) - Number(a.doc.year);
      return a.doc.name.localeCompare(b.doc.name);
    })
    .map((entry) => entry.doc);
}
