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

## ADR-011 — Time zone
- **Status**: Accepted
- **Decision**: Store UTC; display and monthly buckets in `Asia/Jakarta`.

## ADR-012 — Dependency policy
- **Status**: Accepted
- **Decision**: Prefer platform/in-house for small utilities (seeded PRNG, fuzzy matching via simple Levenshtein, SVG chart). Allowed core deps: next, react, tailwindcss, shadcn/ui (radix), fastify (+ @fastify/cookie, @fastify/rate-limit), zod, prisma, vitest, playwright, argon2. Each additional dependency gets a line here.

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
  - **Random**: random teams/matches among those selected.
  - **Balanced Elo**: minimize the sum of team-average Elo differences, with penalties for repeat partners and opponents.
  - **Mexicano**: round 1 = Balanced Elo. Later rounds rank by session wins → session win rate → current Elo → seeded tiebreak; group consecutive 4s; within a group, 1st+4th vs 2nd+3rd.
  - **Americano**: per-round rotation (no precomputed schedule, so late joins and early leaves work); minimize repeat partners first, then repeat opponents, then Elo difference.
  - **Fixed Partner**: teams fixed per session; teams with the fewest games and longest rest play; opponents minimize repeats, then team-Elo difference; with an odd number of teams, resting teams rotate; unpaired players are not scheduled until the admin pairs them.
- **Consequences**: Deterministic, testable rules; weights live in round `settings` and are stored per round.

## ADR-018 — Players are admin-created; no profile claiming in MVP
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
