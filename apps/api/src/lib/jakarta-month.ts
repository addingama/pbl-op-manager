const TZ = 'Asia/Jakarta';

/** Calendar month in Asia/Jakarta as `YYYY-MM`. */
export function jakartaMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  if (year === undefined || month === undefined) throw new Error('failed to format month');
  return `${year}-${month}`;
}

export const JAKARTA_TIMEZONE = TZ;
