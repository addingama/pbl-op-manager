import { describe, expect, it } from 'vitest';
import { sparklinePoints, sparklinePolyline } from './rating-chart';

describe('rating-chart', () => {
  it('returns empty for no data', () => {
    expect(sparklinePoints([], 100, 40)).toEqual([]);
  });

  it('builds ascending polyline coordinates', () => {
    const pts = sparklinePoints([1000, 1100, 1200], 120, 48);
    expect(pts).toHaveLength(3);
    expect(pts[0]?.y).toBeGreaterThan(pts[2]?.y ?? 0);
    const line = sparklinePolyline(pts);
    expect(line).toMatch(/^\d+(\.\d+)?,\d+(\.\d+)?/);
  });
});
