-- CreateEnum
CREATE TYPE "OpenPlayStatus" AS ENUM ('DRAFT', 'OPEN', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GeneratorMode" AS ENUM ('RANDOM', 'BALANCED_ELO', 'MEXICANO', 'AMERICANO', 'FIXED_PARTNER', 'MANUAL');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'ACTIVE', 'UNAVAILABLE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('ADMIN', 'IMPORT');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLAYING', 'RESTING');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RatingRunKind" AS ENUM ('INCREMENTAL', 'REPLAY');

-- CreateEnum
CREATE TYPE "ImportProviderId" AS ENUM ('AYO_LINK', 'MANUAL_PASTE', 'SCREENSHOT');

-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('AYO');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'COMMITTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rating" DECIMAL(10,4) NOT NULL DEFAULT 1000,
    "peakRating" DECIMAL(10,4) NOT NULL DEFAULT 1000,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenPlay" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "venue" TEXT,
    "courtCount" INTEGER NOT NULL,
    "capacity" INTEGER,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "OpenPlayStatus" NOT NULL DEFAULT 'DRAFT',
    "defaultMode" "GeneratorMode" NOT NULL DEFAULT 'BALANCED_ELO',
    "defaultSettings" JSONB NOT NULL DEFAULT '{}',
    "externalProvider" "ExternalProvider",
    "externalEventId" TEXT,
    "externalUrl" TEXT,
    "externalRefCode" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OpenPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenPlayParticipant" (
    "id" TEXT NOT NULL,
    "openPlayId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL,
    "source" "RegistrationSource" NOT NULL,
    "waitlistPos" INTEGER,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "OpenPlayParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedTeam" (
    "id" TEXT NOT NULL,
    "openPlayId" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,

    CONSTRAINT "FixedTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "openPlayId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "mode" "GeneratorMode" NOT NULL,
    "settings" JSONB NOT NULL,
    "seed" TEXT,
    "generatorVersion" TEXT,
    "ratingSnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winnerTeam" INTEGER,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "orderKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundAssignment" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "matchId" TEXT,
    "team" INTEGER,
    "position" INTEGER,

    CONSTRAINT "RoundAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingRun" (
    "id" TEXT NOT NULL,
    "kind" "RatingRunKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "triggerMatch" TEXT,
    "fromOrderKey" TEXT,
    "engineVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingTransaction" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "team" INTEGER NOT NULL,
    "result" INTEGER NOT NULL,
    "ratingBefore" DECIMAL(10,4) NOT NULL,
    "teamRating" DECIMAL(10,4) NOT NULL,
    "opponentRating" DECIMAL(10,4) NOT NULL,
    "expected" DECIMAL(10,6) NOT NULL,
    "delta" DECIMAL(10,4) NOT NULL,
    "ratingAfter" DECIMAL(10,4) NOT NULL,
    "runId" TEXT NOT NULL,
    "supersededByRunId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAlias" (
    "id" TEXT NOT NULL,
    "provider" "ExternalProvider",
    "aliasKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "openPlayId" TEXT NOT NULL,
    "provider" "ImportProviderId" NOT NULL,
    "externalEventId" TEXT,
    "contentHash" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "playerId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "Player_normalizedName_idx" ON "Player"("normalizedName");

-- CreateIndex
CREATE INDEX "Player_rating_idx" ON "Player"("rating");

-- CreateIndex
CREATE INDEX "OpenPlay_startsAt_idx" ON "OpenPlay"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpenPlay_externalProvider_externalEventId_key" ON "OpenPlay"("externalProvider", "externalEventId");

-- CreateIndex
CREATE INDEX "OpenPlayParticipant_openPlayId_status_idx" ON "OpenPlayParticipant"("openPlayId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpenPlayParticipant_openPlayId_playerId_key" ON "OpenPlayParticipant"("openPlayId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedTeam_openPlayId_playerAId_key" ON "FixedTeam"("openPlayId", "playerAId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedTeam_openPlayId_playerBId_key" ON "FixedTeam"("openPlayId", "playerBId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_openPlayId_number_key" ON "Round"("openPlayId", "number");

-- CreateIndex
CREATE INDEX "Match_orderKey_idx" ON "Match"("orderKey");

-- CreateIndex
CREATE UNIQUE INDEX "Match_roundId_courtNumber_key" ON "Match"("roundId", "courtNumber");

-- CreateIndex
CREATE INDEX "RoundAssignment_roundId_idx" ON "RoundAssignment"("roundId");

-- CreateIndex
CREATE INDEX "RoundAssignment_playerId_idx" ON "RoundAssignment"("playerId");

-- CreateIndex
CREATE INDEX "RatingTransaction_playerId_orderKey_idx" ON "RatingTransaction"("playerId", "orderKey");

-- CreateIndex
CREATE INDEX "RatingTransaction_orderKey_idx" ON "RatingTransaction"("orderKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAlias_provider_aliasKey_key" ON "PlayerAlias"("provider", "aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_openPlayId_provider_contentHash_key" ON "ImportBatch"("openPlayId", "provider", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_normalizedName_key" ON "ImportRow"("batchId", "normalizedName");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_openPlayId_fkey" FOREIGN KEY ("openPlayId") REFERENCES "OpenPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedTeam" ADD CONSTRAINT "FixedTeam_openPlayId_fkey" FOREIGN KEY ("openPlayId") REFERENCES "OpenPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedTeam" ADD CONSTRAINT "FixedTeam_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedTeam" ADD CONSTRAINT "FixedTeam_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_openPlayId_fkey" FOREIGN KEY ("openPlayId") REFERENCES "OpenPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundAssignment" ADD CONSTRAINT "RoundAssignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundAssignment" ADD CONSTRAINT "RoundAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundAssignment" ADD CONSTRAINT "RoundAssignment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTransaction" ADD CONSTRAINT "RatingTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTransaction" ADD CONSTRAINT "RatingTransaction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTransaction" ADD CONSTRAINT "RatingTransaction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RatingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTransaction" ADD CONSTRAINT "RatingTransaction_supersededByRunId_fkey" FOREIGN KEY ("supersededByRunId") REFERENCES "RatingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAlias" ADD CONSTRAINT "PlayerAlias_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_openPlayId_fkey" FOREIGN KEY ("openPlayId") REFERENCES "OpenPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL: constraints Prisma cannot express (docs/DATABASE.md §4).
-- Hand-edited; do not re-declare these in schema.prisma.
-- ---------------------------------------------------------------------------

-- A player appears at most once per round. Deferred to COMMIT so a swap can
-- exchange playerId between two rows inside one transaction (ADR-013).
ALTER TABLE "RoundAssignment"
  ADD CONSTRAINT "RoundAssignment_roundId_playerId_key"
  UNIQUE ("roundId", "playerId") DEFERRABLE INITIALLY DEFERRED;

-- One player per match slot.
CREATE UNIQUE INDEX "RoundAssignment_match_slot_key"
  ON "RoundAssignment" ("matchId", "team", "position")
  WHERE "matchId" IS NOT NULL;

ALTER TABLE "RoundAssignment"
  ADD CONSTRAINT "RoundAssignment_status_slot_check" CHECK (
    ("status" = 'PLAYING') = ("matchId" IS NOT NULL AND "team" IS NOT NULL AND "position" IS NOT NULL)
    AND ("status" = 'PLAYING' OR ("matchId" IS NULL AND "team" IS NULL AND "position" IS NULL))
  ),
  ADD CONSTRAINT "RoundAssignment_team_check" CHECK ("team" IS NULL OR "team" IN (1, 2)),
  ADD CONSTRAINT "RoundAssignment_position_check" CHECK ("position" IS NULL OR "position" IN (1, 2));

-- At most one active (non-superseded) ledger row per match and player (ADR-006).
CREATE UNIQUE INDEX "RatingTransaction_active_match_player_key"
  ON "RatingTransaction" ("matchId", "playerId")
  WHERE "supersededByRunId" IS NULL;

ALTER TABLE "RatingTransaction"
  ADD CONSTRAINT "RatingTransaction_team_check" CHECK ("team" IN (1, 2)),
  ADD CONSTRAINT "RatingTransaction_result_check" CHECK ("result" IN (0, 1));

-- Generic (provider-less) aliases are unique too; NULL providers are distinct in the composite key.
CREATE UNIQUE INDEX "PlayerAlias_generic_aliasKey_key"
  ON "PlayerAlias" ("aliasKey")
  WHERE "provider" IS NULL;

ALTER TABLE "OpenPlay"
  ADD CONSTRAINT "OpenPlay_courtCount_check" CHECK ("courtCount" >= 1),
  ADD CONSTRAINT "OpenPlay_capacity_check" CHECK ("capacity" IS NULL OR "capacity" >= 1);

ALTER TABLE "FixedTeam"
  ADD CONSTRAINT "FixedTeam_distinct_players_check" CHECK ("playerAId" <> "playerBId");

ALTER TABLE "Round"
  ADD CONSTRAINT "Round_number_check" CHECK ("number" >= 1);

ALTER TABLE "Match"
  ADD CONSTRAINT "Match_courtNumber_check" CHECK ("courtNumber" >= 1),
  ADD CONSTRAINT "Match_winnerTeam_check" CHECK ("winnerTeam" IS NULL OR "winnerTeam" IN (1, 2));
