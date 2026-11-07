# Database Design (PostgreSQL + Prisma)

Status: Draft for approval · Last updated: 2026-11-07

## 1. Principles

- PostgreSQL 16, Prisma ORM, migrations committed (`packages/database/prisma/migrations`).
- IDs: `cuid2`/`uuid` strings (`@default(uuid())`, uuid v7 if available) — opaque, URL-safe.
- Timestamps in UTC (`timestamptz`); display timezone `Asia/Jakarta` handled in UI. Monthly stats bucket by `Asia/Jakarta` month (see ADR-011).
- Rating history is **append-only**. Rows are never updated except to set `supersededByRunId` during an audited replay.
- Player rating fields are a **projection** (cache) of the ledger and can be rebuilt at any time.
- Constraints Prisma cannot express (partial unique indexes, deferrable constraints, check constraints) are added in hand-edited SQL migrations and documented here.

## 2. Entity overview

```
User 1─0..1 Player ─< OpenPlayParticipant >─ OpenPlay ─< Round ─< Match ─< MatchSlot(4)
                                                       └< RoundAssignment (one per active participant: PLAYING or RESTING)
Match ─< ResultSubmission          Match ─< RatingTransaction >─ RatingRun
Player ─< RatingTransaction        Player ─< PlayerAlias
OpenPlay ─< ImportBatch ─< ImportRow
AuditLog, IdempotencyRecord, AuthSession, AppSetting (standalone)
```

`RoundAssignment` is the single source of truth for who plays where in a round; `Match` holds match-level state. (A separate `MatchSlot` table is **not** needed — slot = assignment with `matchId, team, position`.)

## 3. Prisma schema (draft)

```prisma
generator client { provider = "prisma-client-js" }
datasource db   { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role               { PLAYER ADMIN }
enum OpenPlayStatus     { DRAFT OPEN LIVE COMPLETED CANCELLED }
enum Visibility         { PUBLIC PRIVATE }
enum GeneratorMode      { RANDOM BALANCED_ELO MEXICANO AMERICANO FIXED_PARTNER MANUAL }
enum ParticipantStatus  { REGISTERED WAITLISTED ACTIVE UNAVAILABLE LEFT REMOVED }
enum RegistrationSource { SELF ADMIN IMPORT }
enum AssignmentStatus   { PLAYING RESTING }
enum MatchStatus        { SCHEDULED IN_PROGRESS COMPLETED CANCELLED }
enum RatingRunKind      { INCREMENTAL REPLAY }
enum ImportProviderId   { AYO_LINK MANUAL_PASTE SCREENSHOT }
enum ExternalProvider   { AYO }
enum ImportStatus       { PREVIEWED COMMITTED DISCARDED }

model User {
  id           String   @id @default(uuid())
  email        String?  @unique
  passwordHash String?              // only if password auth is chosen (ADR-005)
  role         Role     @default(PLAYER)
  player       Player?
  sessions     AuthSession[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model AuthSession {
  id         String   @id @default(uuid())
  tokenHash  String   @unique         // sha256 of opaque cookie token
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([userId])
}

model Player {
  id             String   @id @default(uuid())
  displayName    String
  normalizedName String                // lowercase, trimmed, diacritics/emoji stripped
  userId         String?  @unique
  user           User?    @relation(fields: [userId], references: [id])
  active         Boolean  @default(true)
  // Projection of the active rating ledger (rebuildable)
  rating         Decimal  @default(1000) @db.Decimal(10, 4)   // ADR-010: full precision, display rounded
  peakRating     Decimal  @default(1000) @db.Decimal(10, 4)
  matchesPlayed  Int      @default(0)
  wins           Int      @default(0)
  losses         Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  participations OpenPlayParticipant[]
  assignments    RoundAssignment[]
  ratingTxns     RatingTransaction[]
  aliases        PlayerAlias[]
  @@index([normalizedName])
  @@index([rating])
}

model OpenPlay {
  id               String         @id @default(uuid())
  title            String
  startsAt         DateTime
  venue            String?
  courtCount       Int                            // CHECK (court_count >= 1)
  capacity         Int?
  visibility       Visibility     @default(PUBLIC)
  status           OpenPlayStatus @default(DRAFT)
  defaultMode      GeneratorMode  @default(BALANCED_ELO)
  defaultSettings  Json           @default("{}")
  externalProvider ExternalProvider?
  externalEventId  String?
  externalUrl      String?
  externalRefCode  String?                          // AYO referral code, informational
  createdById      String
  version          Int            @default(0)       // optimistic concurrency
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  participants     OpenPlayParticipant[]
  rounds           Round[]
  imports          ImportBatch[]
  fixedTeams       FixedTeam[]
  @@unique([externalProvider, externalEventId])
  @@index([startsAt])
}

model OpenPlayParticipant {
  id           String             @id @default(uuid())
  openPlayId   String
  playerId     String
  status       ParticipantStatus
  source       RegistrationSource
  waitlistPos  Int?
  joinedAt     DateTime           @default(now())
  leftAt       DateTime?
  openPlay     OpenPlay @relation(fields: [openPlayId], references: [id], onDelete: Cascade)
  player       Player   @relation(fields: [playerId], references: [id])
  @@unique([openPlayId, playerId])            // prevents duplicate registration (incl. repeated imports)
  @@index([openPlayId, status])
}

model FixedTeam {                              // FIXED_PARTNER sessions
  id         String @id @default(uuid())
  openPlayId String
  playerAId  String
  playerBId  String
  openPlay   OpenPlay @relation(fields: [openPlayId], references: [id], onDelete: Cascade)
  @@unique([openPlayId, playerAId])
  @@unique([openPlayId, playerBId])
}

model Round {
  id               String        @id @default(uuid())
  openPlayId       String
  number           Int
  mode             GeneratorMode
  settings         Json                         // full effective generator settings
  seed             String?                      // null for MANUAL
  generatorVersion String?                      // e.g. "match-generator@0.3.0"
  ratingSnapshot   Json                         // { playerId: rating } used by generator (informational)
  version          Int           @default(0)    // bumped on every swap
  createdById      String
  createdAt        DateTime      @default(now())
  openPlay         OpenPlay @relation(fields: [openPlayId], references: [id], onDelete: Cascade)
  matches          Match[]
  assignments      RoundAssignment[]
  @@unique([openPlayId, number])
}

model Match {
  id             String      @id @default(uuid())
  roundId        String
  courtNumber    Int
  status         MatchStatus @default(SCHEDULED)
  winnerTeam     Int?                         // 1 | 2, official only; CHECK in (1,2)
  confirmedById  String?
  confirmedAt    DateTime?
  startedAt      DateTime?
  cancelledAt    DateTime?
  cancelReason   String?
  // Canonical Elo order key (denormalized at creation): session start, session id, round number, court
  orderKey       String                       // e.g. "2026-11-07T12:00:00Z|<openPlayId>|00003|02"
  version        Int         @default(0)
  round          Round @relation(fields: [roundId], references: [id], onDelete: Cascade)
  assignments    RoundAssignment[]
  submissions    ResultSubmission[]
  ratingTxns     RatingTransaction[]
  @@unique([roundId, courtNumber])
  @@index([orderKey])
}

model RoundAssignment {
  id        String           @id @default(uuid())
  roundId   String
  playerId  String
  status    AssignmentStatus
  matchId   String?                           // null when RESTING
  team      Int?                              // 1 | 2
  position  Int?                              // 1 | 2
  round     Round   @relation(fields: [roundId], references: [id], onDelete: Cascade)
  player    Player  @relation(fields: [playerId], references: [id])
  match     Match?  @relation(fields: [matchId], references: [id])
  // UNIQUE (round_id, player_id) DEFERRABLE INITIALLY DEFERRED  -- raw SQL, enables in-tx swaps
  // UNIQUE (match_id, team, position) WHERE match_id IS NOT NULL -- raw SQL partial unique
  // CHECK ((status='PLAYING') = (match_id IS NOT NULL AND team IS NOT NULL AND position IS NOT NULL))
  @@index([roundId])
  @@index([playerId])
}

model ResultSubmission {
  id          String   @id @default(uuid())
  matchId     String
  submittedBy String                          // userId
  playerId    String                          // submitter's player (must be in match)
  winnerTeam  Int
  createdAt   DateTime @default(now())
  match       Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  @@unique([matchId, playerId])               // one live submission per participant (upsert to change)
}

model RatingRun {
  id           String        @id @default(uuid())
  kind         RatingRunKind
  reason       String                         // "confirm", "late-confirm", "correction", "cancel-confirmed"
  triggerMatch String?
  fromOrderKey String?                        // replay start position
  engineVersion String                        // "elo-engine@1.0.0"
  createdById  String
  createdAt    DateTime      @default(now())
  transactions RatingTransaction[] @relation("RunCreated")
}

model RatingTransaction {
  id                String   @id @default(uuid())
  playerId          String
  matchId           String
  orderKey          String                    // copy of match.orderKey for ordered scans
  team              Int
  result            Int                       // 1 win, 0 loss
  ratingBefore      Decimal  @db.Decimal(10, 4)
  teamRating        Decimal  @db.Decimal(10, 4)
  opponentRating    Decimal  @db.Decimal(10, 4)
  expected          Decimal  @db.Decimal(10, 6)
  delta             Decimal  @db.Decimal(10, 4)
  ratingAfter       Decimal  @db.Decimal(10, 4)
  runId             String
  supersededByRunId String?
  createdAt         DateTime @default(now())
  player            Player    @relation(fields: [playerId], references: [id])
  match             Match     @relation(fields: [matchId], references: [id])
  run               RatingRun @relation("RunCreated", fields: [runId], references: [id])
  // UNIQUE (match_id, player_id) WHERE superseded_by_run_id IS NULL   -- raw SQL partial unique
  @@index([playerId, orderKey])
  @@index([orderKey])
}

model PlayerAlias {                            // import matching memory
  id         String           @id @default(uuid())
  provider   ExternalProvider?                // null = generic paste alias
  aliasKey   String                            // normalized name or external user id
  playerId   String
  player     Player @relation(fields: [playerId], references: [id])
  createdAt  DateTime @default(now())
  @@unique([provider, aliasKey])
}

model ImportBatch {
  id              String           @id @default(uuid())
  openPlayId      String
  provider        ImportProviderId
  externalEventId String?
  contentHash     String                       // sha256 of normalized participant list
  rawInput        String                       // pasted text (no credentials ever)
  status          ImportStatus     @default(PREVIEWED)
  createdById     String
  createdAt       DateTime         @default(now())
  committedAt     DateTime?
  openPlay        OpenPlay  @relation(fields: [openPlayId], references: [id], onDelete: Cascade)
  rows            ImportRow[]
  @@unique([openPlayId, provider, contentHash])  // repeated identical import ⇒ same batch
}

model ImportRow {
  id             String  @id @default(uuid())
  batchId        String
  rawName        String
  normalizedName String
  matchType      String                        // EXACT | ALIAS | FUZZY | NEW | SKIPPED
  playerId       String?                       // resolved player after review
  batch          ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@unique([batchId, normalizedName])
}

model AuditLog {
  id          String   @id @default(uuid())
  actorUserId String?
  action      String                           // e.g. "round.generate", "round.swap", "match.confirm", "match.correct"
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  reason      String?
  requestId   String?
  createdAt   DateTime @default(now())
  @@index([entityType, entityId])
  @@index([createdAt])
}

model IdempotencyRecord {
  id             String   @id @default(uuid())
  scope          String                         // "POST /sessions/:id/rounds" + actor id
  key            String                         // client Idempotency-Key header
  requestHash    String                         // sha256 of canonical body
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime @default(now())
  expiresAt      DateTime
  @@unique([scope, key])
}

model AppSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```

## 4. Raw SQL additions (hand-edited migration)

```sql
ALTER TABLE "RoundAssignment"
  ADD CONSTRAINT round_player_unique UNIQUE ("roundId", "playerId") DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX match_slot_unique ON "RoundAssignment" ("matchId", team, position) WHERE "matchId" IS NOT NULL;
CREATE UNIQUE INDEX rating_txn_active_unique ON "RatingTransaction" ("matchId", "playerId") WHERE "supersededByRunId" IS NULL;
ALTER TABLE "OpenPlay" ADD CONSTRAINT court_count_positive CHECK ("courtCount" >= 1);
ALTER TABLE "Match"    ADD CONSTRAINT winner_team_valid CHECK ("winnerTeam" IS NULL OR "winnerTeam" IN (1,2));
```

Swap = update `playerId` of two assignment rows in one transaction (the deferrable unique checks at commit). Alternative if deferrable proves awkward with Prisma: swap via a temporary sentinel — decided during M3.

## 5. Elo ledger semantics

**Canonical order**: confirmed, non-cancelled matches sorted by `orderKey` (session `startsAt`, session id, round number, court). Within one round, players are disjoint, so applying matches court-by-court yields exactly the "pre-round snapshot" semantics.

**Active ledger**: `RatingTransaction WHERE supersededByRunId IS NULL`. A player's current rating = `ratingAfter` of their latest active transaction by `orderKey` (or 1000).

**Incremental confirm** (common): the confirmed match's `orderKey` is greater than every active transaction's `orderKey` of its 4 players → compute from current ratings, insert 4 rows under a new `INCREMENTAL` run, update projections.

**Replay** (late confirm out of order, correction, cancelling a confirmed match, or admin "rebuild"):
1. `pg_advisory_xact_lock(<elo lock id>)`.
2. `from = min(orderKey of affected match, …)`.
3. Load ratings as of just before `from` (latest active txn per player with `orderKey < from`).
4. Fold `elo-engine` over all confirmed matches with `orderKey ≥ from` in order.
5. Create a `REPLAY` run; set `supersededByRunId` on old active rows with `orderKey ≥ from`; insert new rows; recompute projections (rating, peak, matchesPlayed, W/L) for affected players.
6. Audit log with reason and before/after rating summary.

Determinism guarantee: replay output depends only on (initial ratings, ordered confirmed results, engine version). A test asserts `replay(all) == incremental history`.

**Precision**: store full-precision decimals in the ledger and projections; display rounded integers (ADR-010, pending confirmation).

**Peak Elo**: max `ratingAfter` over active ledger (and 1000). **Ranked**: `matchesPlayed ≥ 10`.

**Monthly activity**: computed by query over `Match`/`RoundAssignment` with `COMPLETED` status grouped by Jakarta month; no materialization in MVP.

## 6. Idempotency

- Required header `Idempotency-Key` on: round generation, match confirmation, match correction, import commit.
- Flow: insert `IdempotencyRecord(scope,key,requestHash)` in the same tx as the operation; on unique violation → if `requestHash` matches and response stored, replay stored response; if hash differs → `422 IDEMPOTENCY_KEY_REUSED`; if in-flight → `409`.
- Natural-key backstops: `Round(openPlayId, number)`, rating partial unique, `Match.status` state machine (confirm only from `SCHEDULED|IN_PROGRESS`, or same-winner no-op on `COMPLETED`).
- Expiry: 24 h, cleaned by a periodic job (or on startup) — low volume.

## 7. Audit log

Written in the same transaction as the change for: player create/edit/merge, participant add/remove/leave/waitlist promote, round generate/manual edit/delete, swap, match start/cancel, submission, confirm, correct, rating replay, import commit, settings change, role change.

## 8. AYO references

- `OpenPlay.externalProvider = AYO`, `externalEventId = "293332"`, `externalUrl` = original share link, `externalRefCode = "ADDQEO"`.
- Unique `(externalProvider, externalEventId)` prevents two sessions for the same AYO event (admin can override by clearing the ref — pending decision).
- `PlayerAlias(provider=AYO, aliasKey=normalized AYO display name)` remembers admin-confirmed mappings for future imports.
- No AYO credentials or tokens are ever stored; `rawInput` holds only pasted text.

## 9. Seed data

Dev seed: 1 admin, 20 players with varied ratings, 1 draft and 1 completed session with confirmed matches (ledger generated via the engine, not hand-written).
