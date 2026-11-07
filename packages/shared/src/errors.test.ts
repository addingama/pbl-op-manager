import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode, toApiErrorBody } from './errors.js';

describe('AppError', () => {
  it('maps to the API error envelope', () => {
    const err = new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
    expect(toApiErrorBody(err)).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    });
  });
});
