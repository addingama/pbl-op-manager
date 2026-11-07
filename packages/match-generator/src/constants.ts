import type { GeneratorMode, GeneratorSettings } from './types.js';

/** Bump whenever the same input and seed could produce a different round; stored on every round. */
export const GENERATOR_VERSION = '1.0.0';

export const PLAYERS_PER_MATCH = 4;

/**
 * Per-mode defaults. Elo differences are typically 0–200 points, so partner and
 * opponent weights are set to dominate where ADR-017 ranks them first.
 */
export const DEFAULT_SETTINGS: Readonly<Record<GeneratorMode, GeneratorSettings>> = {
  RANDOM: { repeatPartnerWeight: 100, repeatOpponentWeight: 30, ratingDiffWeight: 0, restarts: 1 },
  BALANCED_ELO: {
    repeatPartnerWeight: 60,
    repeatOpponentWeight: 20,
    ratingDiffWeight: 1,
    restarts: 12,
  },
  MEXICANO: {
    repeatPartnerWeight: 60,
    repeatOpponentWeight: 20,
    ratingDiffWeight: 1,
    restarts: 12,
  },
  AMERICANO: {
    repeatPartnerWeight: 1000,
    repeatOpponentWeight: 100,
    ratingDiffWeight: 0.1,
    restarts: 12,
  },
  FIXED_PARTNER: {
    repeatPartnerWeight: 0,
    repeatOpponentWeight: 100,
    ratingDiffWeight: 1,
    restarts: 12,
  },
};
