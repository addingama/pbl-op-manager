export type MatchGeneratorErrorCode =
  | 'INVALID_COURTS'
  | 'INVALID_SEED'
  | 'INVALID_SETTINGS'
  | 'INVALID_RATING'
  | 'DUPLICATE_PARTICIPANT'
  | 'INVALID_FIXED_TEAMS';

export class MatchGeneratorError extends Error {
  readonly code: MatchGeneratorErrorCode;

  constructor(code: MatchGeneratorErrorCode, message: string) {
    super(message);
    this.name = 'MatchGeneratorError';
    this.code = code;
  }
}
