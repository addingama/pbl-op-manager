export type EloEngineErrorCode =
  | 'INVALID_RATING'
  | 'DUPLICATE_PLAYER_IN_MATCH'
  | 'PLAYER_IN_MULTIPLE_MATCHES'
  | 'DUPLICATE_MATCH_ID';

export class EloEngineError extends Error {
  readonly code: EloEngineErrorCode;

  constructor(code: EloEngineErrorCode, message: string) {
    super(message);
    this.name = 'EloEngineError';
    this.code = code;
  }
}
