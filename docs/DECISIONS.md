# Architecture Decision Records

Format: each ADR has Status (Proposed / Accepted / Superseded), Context, Decision, Consequences. Decisions dated 2026-11-07 were confirmed by Addin (ADR-002, ADR-005, ADR-016) or delegated to the planner's recommendation (all others) and are **Accepted** for the MVP plan.

---

## ADR-001 — Monorepo with pnpm workspaces + Turborepo

- **Status**: Accepted (from brief)
- **Context**: Web, API, and shared domain packages must share types and logic.
- **Decision**: pnpm workspaces, Turborepo for task orchestration/caching. Environment observed: Node v22.16.0, pnpm 12.16.1, Docker 29.8.1 available locally; no local `psql` (Postgres via Docker).
- **Consequences**: One lockfile; `turbo prune` for Docker builds. Pin `packageManager` in root `package.json`.

## ADR-002 — Repository root is the monorepo root

- **Status**: Accepted (Addin, 2026-11-07)
- **Context**: Brief shows `pbl-openplay/` as root; the repo is `pbl-op-manager/` (remote `git@github.com:addingama/pbl-op-manager.git`).
- **Decision**: Place `apps/`, `packages/`, workspace files directly at repo root; package scope `@pbl/*`.
- **Consequences**: Simpler paths, CI, and Docker contexts.

## ADR-003 — Pure domain packages for Elo and scheduling

- **Status**: Accepted
- **Decision**: `elo-engine` and `match-generator` are pure, deterministic, I/O-free TypeScript; randomness only via injected seeded PRNG; versioned (`engineVersion`, `generatorVersion`) and recorded with outputs.
- **Consequences**: Exhaustive unit testing; reproducible rounds and replays; API orchestrates persistence.

## ADR-004 — API owns all business logic; web is a client

- **Status**: Accepted
- **Decision**: Fastify API is the only writer to the DB. Next.js uses server components for reads (calling the API) and client components for interactive screens. No Next.js server actions writing to the DB.
- **Consequences**: One authorization point; slightly more plumbing for reads.

## ADR-005 — Authentication: admins only

- **Status**: Accepted (Addin, 2026-11-07)
- **Context**: Only admins need to log in for now; players have no accounts in MVP.
- **Decision**: Admin login with email + password (argon2id). API-owned DB sessions (`AuthSession`, sha256-hashed opaque token) in an httpOnly, Secure, SameSite=Lax cookie with 30-day sliding expiry; custom header required on mutations (CSRF); login rate-limited. First admin created via a `create-admin` CLI; further admins managed in Admin Settings. No auth framework, no email/SMS provider.
- **Consequences**: No external dependencies for auth. Player self-registration and player result submission are deferred. The `Actor` type is designed so a `player` actor can be added later.

## ADR-006 — Elo ledger: append-only with superseding replay runs; corrections replay forward

- **Status**: Accepted
- **Decision**: `RatingTransaction` rows are immutable; corrections, cancellations of confirmed matches, and out-of-order confirmations trigger a `REPLAY` `RatingRun` from the earliest affected canonical position (ADR-015), superseding (not deleting) later rows. No compensating adjustments. All rating writes serialized by a Postgres advisory transaction lock; partial unique index prevents duplicate active transactions.
- **Rationale**: Players are disjoint within a round, so per-court sequential application equals the pre-round snapshot rule. Replay guarantees ratings always equal a pure fold of confirmed results, so history is explainable and reproducible.
- **Consequences**: A correction can retroactively change later ratings of other players; history shows the replay run and reason. Write volume is small, so global serialization is acceptable.

## ADR-007 — Minimal client data layer

- **Status**: Accepted
- **Decision**: No TanStack Query/Redux initially. Server components + typed fetch + local optimistic state for swaps/winner selection; polling on live screens.
- **Consequences**: Fewer deps; revisit if cache invalidation becomes painful.

## ADR-008 — Idempotency keys + natural-key backstops

- **Status**: Accepted
- **Decision**: `Idempotency-Key` header required for round generation, confirm, confirm-all, correct, import commit; stored in `IdempotencyRecord` in the same transaction; plus DB unique constraints and state-machine guards.

## ADR-009 — AYO import: manual paste MVP, offline link parsing, provider interface, one session per event

- **Status**: Accepted
- **Context** (investigated 2026-11-07 via ordinary public HTTP GET only):
  - `https://link.ayo.co.id/l/main_bareng_293332_ref_ADDQEO` → `302` to a Firebase Dynamic Link (`ayoindonesia.page.link`) whose params include `afl/ifl=https://ayo.co.id/main-bareng/id/293332` and `link=https://ayo.co.id?type=mabar&mabar_id=293332&referral_code=ADDQEO`; Android package `coid.ayo.ayo_mobile_app`.
  - The web fallback `https://ayo.co.id/main-bareng/id/293332` → `301` to the generic listing `https://ayo.co.id/main-bareng`; no event detail or participant list was publicly available for this event (it may be past/expired; public event pages appear to use slug URLs).
  - `https://ayo.co.id/robots.txt` disallows AI crawlers (GPTBot, ClaudeBot, CCBot, etc.) entirely and several paths for all agents.
  - No public, documented AYO API was found. Site JS references participant loading, but that is an undocumented internal endpoint and was not probed or used.
- **Decision**: Parse event ID and referral code locally from the URL (no network request). Participant data comes from manual paste (MVP). Providers: `ayo-link`, `manual-paste`, later `screenshot`, hypothetical `ayo-official-api` only if AYO provides one. Never collect AYO credentials or tokens. One Open Play per AYO event (unique `(provider, externalEventId)`); linking an already-linked event surfaces the existing session.
- **Consequences**: Reliable, legally clean MVP; admin does one copy/paste per event.
- **Note**: Google shut down Firebase Dynamic Links in Aug 2025, but AYO's short links still resolve today; the format may change. The parser accepts several URL shapes and falls back to manual entry of the event ID.

## ADR-010 — Rating precision

- **Status**: Accepted
- **Decision**: Store ratings/deltas as `Decimal(10,4)`; the engine computes in floating point and rounds each delta to 4 dp so replays are bit-identical; UI displays rounded integers.
- **Implementation (M1, `@pbl/elo-engine` `ENGINE_VERSION` 1.0.0)**:
  - Team 1's delta is rounded to 4 dp with `Math.round` semantics (half toward +∞, never `-0`).
  - Team 2 receives its exact negation, so every match is exactly zero-sum.
  - Each `ratingAfter` is rounded to 4 dp again.
  - Display uses `Math.round` to an integer.

## ADR-011 — Time zone

- **Status**: Accepted
- **Decision**: Store UTC; display and monthly buckets in `Asia/Jakarta`.

## ADR-012 — Dependency policy

- **Status**: Accepted
- **Decision**: Prefer platform/in-house for small utilities (seeded PRNG, fuzzy matching via simple Levenshtein, SVG chart). Allowed core deps: next, react, tailwindcss, shadcn/ui (radix), fastify (+ @fastify/cookie, @fastify/rate-limit), zod, prisma, vitest, playwright, argon2. Each additional dependency gets a line here.
  - `zod` (M4, `@pbl/shared`): API request/response contracts and `parseBody` validation helpers.
  - `fastify`, `@fastify/cookie`, `@fastify/rate-limit` (M4, `@pbl/api`): HTTP server, session cookies, login rate limiting.
  - `@prisma/client` + `@prisma/adapter-pg` (M3): Prisma 7 needs the client package and a driver adapter (it has no built-in engine connection); `pg` comes with the adapter.
  - `tsx` (M3, dev only): runs the TypeScript seed script (`prisma db seed`). Node's built-in type stripping can't resolve the `.js` → `.ts` import specifiers used across the workspace.

## ADR-013 — Swap implementation

- **Status**: Accepted
- **Decision**: Swaps exchange `playerId` between two `RoundAssignment` rows in one transaction, with `UNIQUE(roundId, playerId) DEFERRABLE INITIALLY DEFERRED` (raw SQL) and `Round.version` optimistic concurrency. Blocked unless every involved match is `SCHEDULED`.

## ADR-014 — Results are admin-entered only in MVP

- **Status**: Accepted (2026-11-07; delegated by Addin: "simplest safe option")
- **Context**: Players have no accounts (ADR-005). Options: (a) admin-entered only; (b) an unauthenticated per-match "submit winner" link that still needs admin confirmation.
- **Decision**: (a). The admin taps the winning team on the match card, then taps Confirm; the result is official immediately and Elo is applied once. A round-level "Confirm all" confirms every match with a selected winner in one atomic transaction. Winner selection before Confirm is client-side only. Corrections require a reason.
- **Rationale**: (b) has no identity, so anyone with the link could submit, which means spam and false-conflict noise, rate-limiting and abuse handling, and a submissions/conflict UI. It adds little safety because the admin confirms anyway. (a) needs no extra tables or endpoints and matches how the admin already runs the court.
- **Consequences**: `ResultSubmission` table, submission endpoints, and conflict UI are removed from MVP; they come back with player accounts post-MVP. The admin is the single point of result entry (risk noted in ROADMAP).

## ADR-015 — Canonical Elo order: session start → round → court

- **Status**: Accepted
- **Decision**: Matches are rated in order of `Match.orderKey = sessionStartsAt | sessionId | roundNumber | courtNumber`, not confirmation time.
- **Consequences**: Ratings reflect when matches were played; late confirmations trigger a replay (ADR-006) instead of distorting order.

## ADR-016 — Hosting: self-hosted VPS with Docker Compose + Nginx, containerized Postgres

- **Status**: Accepted (Addin, 2026-11-07)
- **Decision**: All services run in Docker Compose on Addin's VPS: `nginx` (Let's Encrypt via `certbot`, webroot renewal), `web`, `api`, `postgres` 16 (named volume, no published port), one-shot `migrate`, and `backup` (nightly `pg_dump -Fc`, 14-day retention). Off-VPS copy of backups recommended (target chosen at deploy time).
- **Rationale**: Low traffic, single host; a managed DB adds cost and network hops with no strong benefit.
- **Consequences**: Addin owns ops (disk, updates, backups); M15 adds a runbook and a restore drill.

## ADR-017 — Generator mode rules

- **Status**: Accepted
- **Decision**: Common first step for all modes: choose who plays by fewest games played this session, then longest rest, then seeded random; the rest sit out.
  - **Random**: random teams/matches among those selected. Repeat partners/opponents are still avoided when history exists (PRD FR-G4 applies to every mode); Elo is ignored.
  - **Balanced Elo**: minimize the sum of team-average Elo differences, with penalties for repeat partners and opponents.
  - **Mexicano**: round 1 = Balanced Elo. Later rounds rank by session wins → session win rate → current Elo → seeded tiebreak; group consecutive 4s; within a group, 1st+4th vs 2nd+3rd.
  - **Americano**: per-round rotation (no precomputed schedule, so late joins and early leaves work); minimize repeat partners first, then repeat opponents, then Elo difference.
  - **Fixed Partner**: teams fixed per session; teams with the fewest games and longest rest play; opponents minimize repeats, then team-Elo difference; with an odd number of teams, resting teams rotate; unpaired players are not scheduled until the admin pairs them.
- **Consequences**: Deterministic, testable rules; weights live in round `settings` and are stored per round.
- **Implementation (M2, `@pbl/match-generator` `GENERATOR_VERSION` 1.0.0)**:
  - **Input**: active participants (id, rating), courts, mode, seed, optional settings, fixed teams, and this session's previous rounds with results. The generator derives games, wins, last round played, and partner/opponent counts itself, so callers cannot pass inconsistent stats. Unconfirmed results count as played but not as wins; cancelled matches are omitted by the caller.
  - **Determinism**: participants and teams are put in canonical (id) order before any randomness, so input order never matters. Randomness comes from a seeded mulberry32 PRNG over a hash of the seed string.
  - **Pairing**: per-mode weighted cost (`repeatPartnerWeight`, `repeatOpponentWeight`, `ratingDiffWeight`) minimized by seeded local search with `restarts`. Mexicano rounds after results use the deterministic ranking instead. Mexicano round 1 is identical to Balanced Elo.
  - **Fixed Partner**: a team's games are the max of its two players, and its last round is the more recent of the two. A team with an absent member does not play, and its present member rests.
  - **Output**: courts 1..n, a resting list sorted by id, effective settings, and diagnostics (team-Elo difference, repeat partners and opponents). `validateRound` checks the hard constraints and can be reused for manual rounds and swaps.
    — Players are admin-created; no profile claiming in MVP

- **Status**: Accepted
- **Decision**: Admins create all players (manually or via import). `Player` has no `userId` in MVP; claiming/linking accounts is a post-MVP migration.

## ADR-019 — Privacy

- **Status**: Accepted
- **Decision**: Player display names, ratings, rating history, and match history are public to guests (that's the leaderboard's purpose). No contact details or other PII are stored. Private sessions are hidden from guests. Players who want privacy can ask the admin to use a nickname or deactivate them.

## ADR-020 — UI language

- **Status**: Accepted
- **Decision**: English UI in MVP. All user-facing strings live in one `messages.ts` module per app, and error messages are keyed by `@pbl/shared` error codes, so Bahasa Indonesia can be added later without an i18n library now.

## ADR-021 — Shared agent context lives in-repo (AGENTS.md)

- **Status**: Accepted (Addin, 2026-11-07)
- **Context**: Addin works with both Cursor and Codex; both must share the same project context and rules.
- **Decision**: Root `AGENTS.md` is the single source of truth for agent context (purpose, stack, layout, key ADRs, process rules, doc pointers). Cursor and Codex both load it natively. `CLAUDE.md` is a thin pointer to `AGENTS.md` for Claude Code. No `.cursor/rules/` or other tool-specific copies unless Cursor-only enforcement is needed, and even then they should point to AGENTS.md rather than repeat it.
- **Consequences**: One file to maintain. When an ADR changes the summary, update AGENTS.md in the same commit.

## ADR-022 — M0 tooling baseline

- **Status**: Accepted (M0, 2026-11-08)
- **Decision**:
  - TypeScript is pinned to `~6.0`, because typescript-eslint 8.x supports `<6.1` (TypeScript 7 is not supported yet).
  - ESLint 10 flat config at the root with `typescript-eslint` `strictTypeChecked` and `eslint-config-prettier`; Prettier 3; Vitest 5; Turborepo 2.
  - Shared tooling is installed once at the root.
  - Internal packages are source-only in M0: `exports` points at `src/index.ts`, so there is no build step until a consumer needs one.
  - Each package has `lint`, `typecheck` (`tsc --noEmit`), and `test` (`vitest run`), and Turborepo runs them all; the root `vitest.config.js` lists `projects` so tests can also run from the root.
  - Dev Postgres runs in `docker-compose.dev.yml`, bound to `127.0.0.1:5433` by default, because Addin's Mac already runs a native Postgres on 5432.
- **Consequences**: Revisit the TypeScript pin when typescript-eslint supports 7.x. Packages that need emitted JS (the API runtime, Docker images) add a build step in their own milestone.

## ADR-023 — Database package tooling (Prisma 7)

- **Status**: Accepted (M3, 2026-11-08)
- **Decision**:
  - Prisma is pinned to stable `7.10.1`; npm's `latest` tag pointed at an 8.0 release candidate. The client uses the `prisma-client` generator (ESM, TypeScript output to `packages/database/src/generated/`, gitignored) with the `@prisma/adapter-pg` driver adapter. `prisma.config.ts` holds the datasource URL, migrations path, and seed command.
  - The generated client is produced by a Turborepo `db:generate` task, which `lint`, `typecheck`, `test`, and `build` depend on, so a clean checkout works without a manual step. `@pbl/database` exports `createPrismaClient()`, the generated types, `matchOrderKey()`, and `violatedConstraint()` (constraint name from a Prisma error or from the bare driver error a DEFERRED constraint raises at COMMIT).
  - **Swaps use the deferrable constraint** (the sentinel alternative from DATABASE.md §4 is not needed). Schema declares `@@unique([roundId, playerId])` so Prisma sees no drift and generates `findUnique({ roundId_playerId })`. The init migration creates it as `CONSTRAINT … UNIQUE … DEFERRABLE INITIALLY DEFERRED` under the same name, instead of Prisma's plain index. Partial unique indexes and CHECK constraints live only in raw SQL; Prisma ignores them when diffing.
  - All timestamps are `timestamptz(3)` and ids are UUIDv7 (`uuid(7)`), generated by Prisma.
  - Integration tests run against `<DATABASE_URL db>_test` on the dev Postgres (or `TEST_DATABASE_URL`). Vitest global setup drops, recreates, and migrates it once per run (`prisma migrate deploy`), refusing any name not ending in `_test`. Each suite truncates the tables, and files run serially. `pnpm test` therefore needs `pnpm db:up`.
  - The dev seed wipes and reloads deterministic data (matches from `@pbl/match-generator`, ledger from `@pbl/elo-engine`) and refuses to run with `NODE_ENV=production`.
- **Consequences**: Future migrations must keep the raw-SQL objects (`prisma migrate diff` must stay empty — a test asserts it). Prisma blocks `migrate reset` when run by an AI agent without explicit user consent; agents should use a scratch database instead.

## ADR-024 — API foundation (M4)

- **Status**: Accepted (M4, 2026-11-08)
- **Decision**:
  - `buildServer()` in `apps/api` registers Fastify with pino logging, request-id (`X-Request-Id`), central `AppError` → JSON mapping, CSRF header (`X-Requested-With: pbl`) on all mutations except `POST /api/auth/login`, and DB-backed admin sessions (opaque cookie `pbl_session`, sha256 hash at rest, 30-day sliding expiry).
  - `@pbl/shared` owns error codes, Zod auth/health schemas, `parseBody`, and HTTP constants. `@pbl/api` owns `runIdempotent`, `writeAudit`, and `requireAdmin`.
  - Login is rate-limited (5/min per IP+email). `pnpm create-admin` bootstraps the first admin; further admins are post-MVP Admin Settings.
  - Non-production-only `POST /api/dev/mutate-check` proves admin+CSRF guards in tests; production has no dev routes.
  - Integration tests use `fastify.inject` against `<db>_test`; root `pnpm test` runs Turborepo with `--concurrency=1` so `@pbl/database` and `@pbl/api` do not race on DB recreation.
- **Consequences**: M5+ modules mount under `/api` with `requireAdmin` + CSRF on mutations; business routes use `runIdempotent` where ADR-008 requires keys.

## ADR-025 — Players and sessions API (M5)

- **Status**: Accepted (M5, 2026-11-09)
- **Decision**:
  - REST under `/api/players` and `/api/sessions` using Zod contracts in `@pbl/shared`. Guest GETs for public data; every mutation requires admin session + CSRF (M4).
  - Player create rejects exact `normalizedName` duplicates (`409 PLAYER_DUPLICATE`); similar active names (Levenshtein ≤ 2) return `warnings` on success (FR-P3).
  - Guests see only `PUBLIC` sessions; private sessions return 404 to guests. Admins see all sessions.
  - Session lifecycle: `DRAFT→OPEN→LIVE→COMPLETED|CANCELLED` with explicit allowed transitions; invalid transitions return `409 INVALID_STATUS_TRANSITION`.
  - Participants: admin `POST …/participants` (multi `playerIds`), capacity overflow → `WAITLISTED` with FIFO `waitlistPos`, `POST …/promote` for waitlist, `PATCH` for `UNAVAILABLE`/`LEFT`, `DELETE` → `REMOVED`. Late join during `LIVE` assigns `ACTIVE`.
- **Consequences**: M6 round generation reads participant statuses (`ACTIVE`/`UNAVAILABLE`/…); rating history chart endpoints remain a later milestone.

## ADR-026 — Rounds API: generation, manual build, swaps (M6)

- **Status**: Accepted (M6, 2026-11-09)
- **Decision**:
  - `POST /api/sessions/:id/rounds` is idempotent (`Idempotency-Key`, body hash, `runIdempotent`); persists mode, settings JSON, seed, `generatorVersion` (`match-generator@…`), and per-round rating snapshot; locks `OpenPlay` row (`SELECT … FOR UPDATE`) while numbering rounds.
  - Eligible schedulable participants: `REGISTERED` and `ACTIVE` only. Generation allowed when session is `OPEN` or `LIVE`; `MANUAL` uses dedicated create/edit routes.
  - Swaps use optimistic concurrency on `round.version` (`409 ROUND_CHANGED`); blocked when any involved match is not `SCHEDULED` (`409 MATCH_ALREADY_STARTED`). Player swaps update two `RoundAssignment.playerId` values in one transaction (deferrable unique on `(roundId, playerId)` from M3).
  - Manual rounds: create, replace assignments while all matches are `SCHEDULED`, delete last round if unstarted.
- **Consequences**: M7+ can build UI on stable round DTOs; match/round start marks matches `IN_PROGRESS` without scoring (M8+).

## ADR-027 — Results and Elo ledger API (M7)

- **Status**: Accepted (M7, 2026-11-09)
- **Decision**:
  - Admin-only result entry: `POST /matches/:id/confirm` (idempotent), `POST /rounds/:id/confirm-all`, `POST /matches/:id/cancel`, `POST /matches/:id/correct` (idempotent, reason required).
  - All rating writes run under `pg_advisory_xact_lock` (global Elo lock). Incremental path when the new match’s `orderKey` is after every player’s latest active ledger row; otherwise deterministic `REPLAY` from the earliest affected `orderKey` via `@pbl/elo-engine` `foldLedger`.
  - Append-only `RatingTransaction` rows superseded on replay; `Player` projections rebuilt from active ledger.
  - `assertLedgerMatchesFold` integration helper verifies fold ≡ projections after mutations.
- **Consequences**: M8 leaderboard/history read APIs consume projections and ledger; no player submissions (ADR-014).

## ADR-028 — Leaderboard & profile read API (M8)

- **Status**: Accepted (M8, 2026-11-09)
- **Decision**:
  - Guest GETs: `/api/leaderboard` (`tab=ranked|provisional`, pagination), extended `/api/players/:id` (rank + status), `/api/players/:id/rating-history`, `/recent-matches`, `/monthly-activity`.
  - Ranked tab: active players with `matchesPlayed ≥ 10`, competition ranks by `rating` desc. Provisional tab: active players below threshold; `rank` null.
  - Reads use `Player` projections plus active `RatingTransaction` rows; monthly buckets use `Asia/Jakarta` (ADR timezone decision).
  - Leaderboard-specific routes register before `/players/:id` so nested paths resolve.
- **Consequences**: M9 web can bind leaderboard/profile UI to shared Zod contracts; no new tables.

## ADR-029 — Web foundation (M9)

- **Status**: Accepted (M9, 2026-11-09)
- **Decision**:
  - `apps/web` is Next.js 15 App Router with Tailwind v4; shadcn-style primitives live in `@pbl/ui` (Button, Input, Card, `cn`).
  - Browser calls same-origin `/api/*` via Next rewrites to Fastify; server components use `API_URL` with forwarded cookies.
  - English copy in `apps/web/messages.ts`; errors map from `@pbl/shared` codes.
  - Mobile-first layout with bottom-style nav; guest vs admin affordances (sign-in link vs sign-out).
  - MVP pages: Home, Open Play list, admin Login; Vitest for copy/format helpers; Playwright smoke `home → list` via `pnpm --filter @pbl/web test:e2e` (optional `SKIP_E2E=1`).
- **Consequences**: M10+ screens extend routes and client islands without TanStack Query (ADR-007).
