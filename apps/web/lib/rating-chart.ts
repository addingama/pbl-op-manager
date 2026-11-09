export interface SparklinePoint {
  x: number;
  y: number;
}

/** Build SVG polyline points from numeric ratings (oldest → newest). */
export function sparklinePoints(
  ratings: number[],
  width: number,
  height: number,
  padding = 4,
): SparklinePoint[] {
  if (ratings.length === 0) return [];
  if (ratings.length === 1) {
    const y = height / 2;
    return [
      { x: padding, y },
      { x: width - padding, y },
    ];
  }
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return ratings.map((r, i) => {
    const x = padding + (i / (ratings.length - 1)) * innerW;
    const norm = (r - min) / span;
    const y = padding + innerH - norm * innerH;
    return { x, y };
  });
}

export function sparklinePolyline(points: SparklinePoint[]): string {
  return points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
}
