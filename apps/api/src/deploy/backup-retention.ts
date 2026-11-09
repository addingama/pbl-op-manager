const BACKUP_NAME =
  /^pbl_(?<date>\d{4})(?<month>\d{2})(?<day>\d{2})T(?<hour>\d{2})(?<min>\d{2})(?<sec>\d{2})Z\.sql\.gz$/;

export function backupFileAgeMs(filename: string, nowMs: number): number | null {
  const match = BACKUP_NAME.exec(filename);
  if (match?.groups === undefined) return null;
  const date = match.groups['date'];
  const month = match.groups['month'];
  const day = match.groups['day'];
  const hour = match.groups['hour'];
  const min = match.groups['min'];
  const sec = match.groups['sec'];
  if (
    date === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    min === undefined ||
    sec === undefined
  ) {
    return null;
  }
  const iso = `${date}-${month}-${day}T${hour}:${min}:${sec}Z`;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return nowMs - at;
}

export function shouldPruneBackup(filename: string, nowMs: number, retainDays: number): boolean {
  const ageMs = backupFileAgeMs(filename, nowMs);
  if (ageMs === null) return false;
  return ageMs > retainDays * 24 * 60 * 60 * 1000;
}
