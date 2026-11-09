/** Stable API error codes (ADR: live in @pbl/shared for UI mapping). */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_REQUIRED: 'CSRF_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_DUPLICATE: 'PLAYER_DUPLICATE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetails {
  readonly [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, httpStatus: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (details !== undefined) this.details = details;
  }
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: ErrorDetails;
  };
}

export function toApiErrorBody(err: AppError): ApiErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}
