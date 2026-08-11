/** Small helpers for the optimistic-update pattern used across the pages. */

export function tempId(prefix: string) {
  return `${prefix}-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function upsertById<T>(rows: T[], row: T, idKey: keyof T): T[] {
  const id = row[idKey];
  const index = rows.findIndex((candidate) => candidate[idKey] === id);
  if (index < 0) return [...rows, row];
  const next = [...rows];
  next[index] = row;
  return next;
}

export function removeById<T>(rows: T[], id: unknown, idKey: keyof T): T[] {
  return rows.filter((row) => row[idKey] !== id);
}
