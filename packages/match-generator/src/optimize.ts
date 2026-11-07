import type { Random } from './random.js';

/**
 * Seeded local search over an arrangement of units. Units are read in
 * consecutive groups of `groupSize` (one group = one match); `groupCost` scores
 * one group. Each restart starts from a fresh shuffle and applies improving
 * pairwise swaps until none is left. Swapping two units in the same consecutive
 * pair (same team, or the two teams of one match) never changes the outcome, so
 * those swaps are skipped. Ties keep the earlier arrangement, so results depend
 * only on the input order and the seed.
 */
export function optimizeArrangement<T>(
  units: readonly T[],
  groupSize: number,
  groupCost: (group: readonly T[]) => number,
  random: Random,
  restarts: number,
): T[] {
  const groups = units.length / groupSize;
  let best: T[] = [...units];
  let bestCost = Number.POSITIVE_INFINITY;

  for (let r = 0; r < Math.max(1, restarts); r++) {
    const arrangement = random.shuffle(units);
    const costs = Array.from({ length: groups }, (_, g) =>
      groupCost(arrangement.slice(g * groupSize, (g + 1) * groupSize)),
    );
    const costOf = (g: number) => costs[g] ?? 0;
    const recompute = (g: number) =>
      groupCost(arrangement.slice(g * groupSize, (g + 1) * groupSize));

    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < arrangement.length; i++) {
        for (let j = i + 1; j < arrangement.length; j++) {
          if (Math.floor(i / 2) === Math.floor(j / 2)) continue;
          const gi = Math.floor(i / groupSize);
          const gj = Math.floor(j / groupSize);
          const before = gi === gj ? costOf(gi) : costOf(gi) + costOf(gj);

          swap(arrangement, i, j);
          const newGi = recompute(gi);
          const newGj = gi === gj ? newGi : recompute(gj);
          const after = gi === gj ? newGi : newGi + newGj;

          if (after < before - 1e-9) {
            costs[gi] = newGi;
            costs[gj] = newGj;
            improved = true;
          } else {
            swap(arrangement, i, j);
          }
        }
      }
    }

    const total = costs.reduce((sum, c) => sum + c, 0);
    if (total < bestCost - 1e-9) {
      bestCost = total;
      best = [...arrangement];
    }
  }

  return best;
}

function swap(items: unknown[], i: number, j: number): void {
  const tmp = items[i];
  items[i] = items[j];
  items[j] = tmp;
}
