import type { MonthlyActivityRow } from '@pbl/shared';
import { messages } from '@/messages';

export function MonthlyActivityList({ rows }: { rows: MonthlyActivityRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">{messages.profile.noActivity}</p>;
  }
  const max = Math.max(...rows.map((r) => r.matchesPlayed), 1);
  return (
    <ul className="flex flex-col gap-2" data-testid="monthly-activity">
      {rows.map((row) => {
        const pct = Math.round((row.matchesPlayed / max) * 100);
        return (
          <li key={row.month} className="flex items-center gap-3 text-sm">
            <span className="w-14 shrink-0 text-slate-600">{row.month}</span>
            <span
              className="h-3 flex-1 rounded bg-slate-100"
              role="presentation"
              aria-hidden
            >
              <span
                className="block h-3 rounded bg-emerald-600"
                style={{ width: `${String(pct)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-slate-700">
              {row.matchesPlayed}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
