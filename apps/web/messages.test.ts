import { describe, expect, it } from 'vitest';
import { messageForErrorCode, messages } from './messages';

describe('messages', () => {
  it('maps known error codes', () => {
    expect(messageForErrorCode('UNAUTHORIZED')).toContain('sign in');
  });

  it('exposes navigation labels', () => {
    expect(messages.nav.sessions).toBe('Open Play');
  });
});
