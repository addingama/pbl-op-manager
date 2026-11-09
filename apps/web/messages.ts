import type { ErrorCode } from '@pbl/shared';

export const messages = {
  app: {
    name: 'PBL Open Play',
    tagline: 'Padel open play sessions, matches, and lifetime Elo.',
  },
  nav: {
    home: 'Home',
    sessions: 'Open Play',
    adminSignIn: 'Admin sign in',
    adminSignedIn: 'Signed in',
    signOut: 'Sign out',
  },
  home: {
    title: 'Welcome',
    intro: 'Browse public open play sessions or sign in as an admin to run a court.',
    viewSessions: 'View open play list',
  },
  sessions: {
    title: 'Open Play',
    empty: 'No public sessions yet.',
    participants: 'participants',
    courts: 'courts',
    viewDetail: 'View session',
    backToList: 'Back to list',
    notFound: 'Session not found or not visible.',
  },
  sessionDetail: {
    standings: 'Session standings',
    rounds: 'Rounds',
    noRounds: 'No rounds yet.',
    resting: 'Resting',
    court: 'Court',
    participants: 'Participants',
    waitlist: 'Waitlist',
    inactive: 'Left / unavailable',
    manage: 'Manage participants',
    searchPlayers: 'Search players',
    addSelected: 'Add selected',
    remove: 'Remove',
    promote: 'Promote',
    markUnavailable: 'Mark unavailable',
    markLeft: 'Mark left',
    saving: 'Saving…',
    added: 'Players added.',
    updated: 'Participant updated.',
  },
  matchStatus: {
    SCHEDULED: 'Scheduled',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  },
  participantStatus: {
    REGISTERED: 'Registered',
    WAITLISTED: 'Waitlisted',
    ACTIVE: 'Active',
    UNAVAILABLE: 'Unavailable',
    LEFT: 'Left',
    REMOVED: 'Removed',
  },
  login: {
    title: 'Admin sign in',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    failed: 'Invalid email or password.',
    back: 'Back to home',
  },
  status: {
    DRAFT: 'Draft',
    OPEN: 'Open',
    LIVE: 'Live',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  },
} as const;

const errorMessages: Partial<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'Please sign in as an admin.',
  VALIDATION_ERROR: 'Please check the form and try again.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  SESSION_NOT_FOUND: 'Session not found.',
  PARTICIPANT_NOT_FOUND: 'Participant not found.',
  PLAYER_NOT_FOUND: 'One or more players were not found.',
  INVALID_STATUS_TRANSITION: 'This change is not allowed for the session status.',
};

export function messageForErrorCode(code: ErrorCode): string {
  return errorMessages[code] ?? 'Something went wrong. Please try again.';
}
