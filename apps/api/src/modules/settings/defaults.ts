import type { AppDefaults } from '@pbl/shared';
import { RANKED_THRESHOLD } from '@pbl/shared';

export const DEFAULT_APP_SETTINGS: AppDefaults = {
  defaultMode: 'BALANCED_ELO',
  defaultCourtCount: 2,
  defaultVisibility: 'PUBLIC',
  rankedThreshold: RANKED_THRESHOLD,
};

export const SETTINGS_KEY = 'app.defaults';
