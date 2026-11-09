import { sparklinePoints, sparklinePolyline } from '@/lib/rating-chart';
import { messages } from '@/messages';

export function RatingHistoryChart({ ratings }: { ratings: number[] }) {
  const width = 320;
  const height = 72;
  const points = sparklinePoints(ratings, width, height);

  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-600" data-testid="rating-history-empty">
        {messages.profile.noRatingHistory}
      </p>
    );
  }

  return (
    <svg
      role="img"
      aria-label={messages.profile.ratingHistoryAria}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className="h-[4.5rem] w-full max-w-sm text-emerald-700"
      data-testid="rating-history-chart"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={sparklinePolyline(points)}
      />
    </svg>
  );
}
