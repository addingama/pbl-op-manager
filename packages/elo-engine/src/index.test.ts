import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@pbl/elo-engine', () => {
  it('is wired into the workspace', () => {
    expect(PACKAGE_NAME).toBe('@pbl/elo-engine');
  });
});
