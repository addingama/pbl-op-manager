/** Lowercase, trim, strip diacritics and common emoji — used for duplicate detection (FR-P3). */
export function normalizeDisplayName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j < cols; j++) {
    const row = matrix[0];
    if (row) row[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = matrix[i - 1];
      const curRow = matrix[i];
      if (!prevRow || !curRow) continue;
      curRow[j] = Math.min(prevRow[j]! + 1, curRow[j - 1]! + 1, prevRow[j - 1]! + cost);
    }
  }
  const last = matrix[a.length];
  return last ? (last[b.length] ?? 0) : 0;
}
