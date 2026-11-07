import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index.js';

describe('@pbl/web', () => {
  it('is wired into the workspace', () => {
    expect(APP_NAME).toBe('@pbl/web');
  });
});
