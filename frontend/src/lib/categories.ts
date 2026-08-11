/**
 * The E-Library taxonomy — the single source of truth for the sidebar, the breadcrumb, and the
 * Category picker in the upload dialog.
 *
 * A document is filed under a `category_path` (slash-joined, e.g. "Issuances/CHED Memorandum
 * Orders") plus a `year` and, for CEB Matters only, a `month`. Year and month are deliberately
 * NOT part of the path: they are bounded, generated ranges, so keeping them as their own fields
 * makes filtering and cross-year search trivial.
 */

/** Levels a category requires below its path, in order. */
export type CategoryLevel = 'year' | 'month';

export type CategoryNode = {
  /** Display label. Also the path segment. */
  label: string;
  children?: CategoryNode[];
  /** Only set on leaf nodes — the levels a document under this node must specify. */
  levels?: CategoryLevel[];
};

const YEAR: CategoryLevel[] = ['year'];
const YEAR_MONTH: CategoryLevel[] = ['year', 'month'];

export const CATEGORY_TREE: CategoryNode[] = [
  {
    label: 'Issuances',
    children: [
      { label: 'CHED Memorandum Orders', levels: YEAR },
      { label: 'CHED Administrative Orders', levels: YEAR },
      { label: 'Joint Administrative Orders', levels: YEAR },
      { label: 'Joint Memorandum Circulars', levels: YEAR },
      { label: 'Joint Advisories', levels: YEAR },
      { label: 'Memorandum from the Office of the Chairperson', levels: YEAR },
      { label: 'Memorandum from the Office of the Executive Director', levels: YEAR },
    ],
  },
  { label: 'Legal Bases', levels: YEAR },
  { label: 'Significant Communication', levels: YEAR },
  { label: 'Physical and Financial Reports', levels: YEAR },
  { label: 'CEB Matters', levels: YEAR_MONTH },
  { label: 'Office Order/Memorandum', levels: YEAR },
  { label: 'Audit Query/Observation Memorandum', levels: YEAR },
  { label: 'Budget', levels: YEAR },
  { label: 'Work and Financial Plan', levels: YEAR },
  { label: 'Reports', levels: YEAR },
  { label: 'Complaints', levels: YEAR },
  { label: 'Freedom of Information', levels: YEAR },
  { label: 'Position Papers', levels: YEAR },
];

/**
 * Deliberately not "/" — one category is literally labelled "Office Order/Memorandum", so a slash
 * separator would split that label into two bogus levels.
 */
export const PATH_SEPARATOR = '::';

export function joinPath(segments: string[]) {
  return segments.filter(Boolean).join(PATH_SEPARATOR);
}

export function splitPath(path: string) {
  return String(path || '').split(PATH_SEPARATOR).filter(Boolean);
}

/** "Issuances::CHED Memorandum Orders" -> "Issuances > CHED Memorandum Orders". */
export function displayPath(path: string) {
  return splitPath(path).join(' > ');
}

/** True when `path` is `parent` itself or sits beneath it. An empty parent matches everything. */
export function isWithinPath(path: string, parent: string) {
  if (!parent) return true;
  return path === parent || String(path || '').startsWith(parent + PATH_SEPARATOR);
}

/** Human-readable breadcrumb: "Issuances > CHED Memorandum Orders > 2026". */
export function breadcrumbLabel(path: string, year?: string, month?: string) {
  const parts = splitPath(path);
  if (year) parts.push(year);
  if (month) parts.push(monthLabel(month));
  return parts.join(' > ');
}

/** Walks the tree and returns the node at `path`, or null when the path is unknown. */
export function findNode(path: string): CategoryNode | null {
  const segments = splitPath(path);
  let nodes = CATEGORY_TREE;
  let node: CategoryNode | null = null;
  for (const segment of segments) {
    const match = nodes.find((candidate) => candidate.label === segment);
    if (!match) return null;
    node = match;
    nodes = match.children || [];
  }
  return node;
}

/** True when `path` points at a filing destination (a node with no children). */
export function isLeafPath(path: string) {
  const node = findNode(path);
  return !!node && !node.children?.length;
}

export function levelsForPath(path: string): CategoryLevel[] {
  return findNode(path)?.levels || [];
}

/** Every leaf path in the tree, in tree order — used to populate the Category dropdown. */
export function leafPaths(): { path: string; label: string }[] {
  const out: { path: string; label: string }[] = [];
  const walk = (nodes: CategoryNode[], trail: string[]) => {
    for (const node of nodes) {
      const next = [...trail, node.label];
      if (node.children?.length) walk(node.children, next);
      else out.push({ path: joinPath(next), label: next.join(' > ') });
    }
  };
  walk(CATEGORY_TREE, []);
  return out;
}

export const FIRST_YEAR = 1994;

/** 1994 through the current year, newest first. */
export function yearOptions(): string[] {
  const current = new Date().getFullYear();
  const years: string[] = [];
  for (let year = current; year >= FIRST_YEAR; year--) years.push(String(year));
  return years;
}

export const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
] as const;

export function monthLabel(month: string) {
  const padded = String(month || '').padStart(2, '0');
  return MONTHS.find(([value]) => value === padded)?.[1] || month;
}
