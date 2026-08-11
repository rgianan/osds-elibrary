import type { LibraryDocument } from '@/types';
import { FIRST_YEAR, MONTHS, isWithinPath, joinPath } from '@/lib/categories';
import { parseTags } from '@/lib/utils';

/**
 * The library's single search. It is keyword search over name/tags/remarks with a rules-based
 * front end: staff type the shorthand they already use on paper ("CMO 2016", "AOM 2023",
 * "CEB August 2025"), so recognised tokens are lifted out of the free text and become category /
 * year / month filters, surfaced as removable chips. Everything it touches is metadata — no PDF
 * text is read.
 */

/**
 * Token sequences that name a category. Longer sequences are matched first, so "joint
 * administrative order" wins over a bare "administrative order".
 *
 * A bare "AO" means a CHED Administrative Order; the joint variant must be written "JAO".
 */
const CATEGORY_ALIASES: { tokens: string[]; path: string }[] = [
  { tokens: ['cmo'], path: joinPath(['Issuances', 'CHED Memorandum Orders']) },
  { tokens: ['ched', 'memorandum', 'order'], path: joinPath(['Issuances', 'CHED Memorandum Orders']) },
  { tokens: ['memorandum', 'order'], path: joinPath(['Issuances', 'CHED Memorandum Orders']) },

  { tokens: ['cao'], path: joinPath(['Issuances', 'CHED Administrative Orders']) },
  { tokens: ['ao'], path: joinPath(['Issuances', 'CHED Administrative Orders']) },
  { tokens: ['ched', 'administrative', 'order'], path: joinPath(['Issuances', 'CHED Administrative Orders']) },
  { tokens: ['administrative', 'order'], path: joinPath(['Issuances', 'CHED Administrative Orders']) },

  { tokens: ['jao'], path: joinPath(['Issuances', 'Joint Administrative Orders']) },
  { tokens: ['joint', 'administrative', 'order'], path: joinPath(['Issuances', 'Joint Administrative Orders']) },

  { tokens: ['jmc'], path: joinPath(['Issuances', 'Joint Memorandum Circulars']) },
  { tokens: ['joint', 'memorandum', 'circular'], path: joinPath(['Issuances', 'Joint Memorandum Circulars']) },

  { tokens: ['ja'], path: joinPath(['Issuances', 'Joint Advisories']) },
  { tokens: ['joint', 'advisory'], path: joinPath(['Issuances', 'Joint Advisories']) },
  { tokens: ['joint', 'advisories'], path: joinPath(['Issuances', 'Joint Advisories']) },

  { tokens: ['chairperson'], path: joinPath(['Issuances', 'Memorandum from the Office of the Chairperson']) },
  { tokens: ['executive', 'director'], path: joinPath(['Issuances', 'Memorandum from the Office of the Executive Director']) },

  { tokens: ['aom'], path: 'Audit Query/Observation Memorandum' },
  { tokens: ['aqom'], path: 'Audit Query/Observation Memorandum' },
  { tokens: ['audit', 'query', 'observation', 'memorandum'], path: 'Audit Query/Observation Memorandum' },
  { tokens: ['audit', 'observation', 'memorandum'], path: 'Audit Query/Observation Memorandum' },
  { tokens: ['audit', 'observation'], path: 'Audit Query/Observation Memorandum' },
  { tokens: ['audit', 'query'], path: 'Audit Query/Observation Memorandum' },

  { tokens: ['oo'], path: 'Office Order/Memorandum' },
  // Three tokens once the slash is split, so the full name is consumed rather than leaving
  // "memorandum" behind as a keyword term that every result would then have to contain.
  { tokens: ['office', 'order', 'memorandum'], path: 'Office Order/Memorandum' },
  { tokens: ['office', 'order'], path: 'Office Order/Memorandum' },

  { tokens: ['wfp'], path: 'Work and Financial Plan' },
  { tokens: ['work', 'and', 'financial', 'plan'], path: 'Work and Financial Plan' },
  { tokens: ['work', 'financial', 'plan'], path: 'Work and Financial Plan' },

  { tokens: ['ceb'], path: 'CEB Matters' },
  { tokens: ['ceb', 'matters'], path: 'CEB Matters' },

  { tokens: ['legal', 'bases'], path: 'Legal Bases' },
  { tokens: ['legal', 'basis'], path: 'Legal Bases' },
  { tokens: ['significant', 'communication'], path: 'Significant Communication' },
  { tokens: ['physical', 'and', 'financial', 'report'], path: 'Physical and Financial Reports' },
  // The previous wording, kept so staff who learned the old order still land in the right place.
  { tokens: ['financial', 'and', 'physical', 'report'], path: 'Physical and Financial Reports' },
  { tokens: ['physical', 'report'], path: 'Physical and Financial Reports' },
  { tokens: ['financial', 'report'], path: 'Physical and Financial Reports' },
  { tokens: ['budget'], path: 'Budget' },
  { tokens: ['issuance'], path: 'Issuances' },
  { tokens: ['issuances'], path: 'Issuances' },

  // A bare "report" must stay last among the report aliases: the longer "financial and physical
  // report" is matched first because the list is sorted by token count.
  { tokens: ['report'], path: 'Reports' },

  { tokens: ['complaint'], path: 'Complaints' },
  { tokens: ['freedom', 'of', 'information'], path: 'Freedom of Information' },
  { tokens: ['foi'], path: 'Freedom of Information' },
  { tokens: ['position', 'paper'], path: 'Position Papers' },
].sort((a, b) => b.tokens.length - a.tokens.length);

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

function normalize(value: string) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s./-]/gu, ' ');
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
  for (const alias of CATEGORY_ALIASES) {
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
