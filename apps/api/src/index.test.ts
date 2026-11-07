import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index.js';

describe('@pbl/api', () => {
  it('is wired into the workspace', () => {
    expect(APP_NAME).toBe('@pbl/api');
  });
});
