# Roadmap

Status: Draft for approval (decisions resolved; M0 not started) · Last updated: 2026-11-07

Process per milestone (after plan approval): implement one milestone → smallest complete solution → tests → run `pnpm lint && pnpm typecheck && pnpm test` → changed-file summary + verification steps → **wait for Addin's approval** before the next milestone.

MVP = M0 through M15. MVP acceptance criteria: see PRD.md §8.

---

## M0 — Monorepo foundation
- **Scope**: pnpm workspace + Turborepo; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESLint flat config + Prettier; Vitest workspace config; empty package skeletons (`apps/web`, `apps/api`, `packages/{shared,elo-engine,match-generator,database,ui}`) each with `lint/typecheck/test` scripts; `docker-compose.dev.yml` with Postgres only; `.env.example`; `.nvmrc` (Node 22); `.gitignore` (git and the `origin` remote already exist).
- **Acceptance**: `pnpm install` clean; `pnpm lint`, `pnpm typecheck`, `pnpm test` succeed across all packages via turbo; `docker compose -f docker-compose.dev.yml up -d` starts Postgres.
- **Tests**: one trivial test per package to prove wiring.

## M1 — Elo engine (`packages/elo-engine`)
- **Scope**: pure functions `expectedScore`, `teamRating`, `matchDeltas`, `applyRound` (pre-round snapshot), `foldLedger(initial, orderedResults)`; ranked/provisional helper; constants (1000, 32, 400, ranked threshold 10); engine version export.
- **Acceptance**: matches PRD formulas; zero-sum per match; teammates equal delta; deterministic.
- **Tests**: equal ratings ⇒ ±16; known asymmetric cases; team averaging; parallel-matches snapshot; fold determinism; replay-after-correction equals fresh fold; property-style randomized checks (seeded, no extra deps).

## M2 — Match generator (`packages/match-generator`)
- **Scope**: seeded PRNG (e.g. mulberry32/sfc32, in-house); input = participants (id, rating, session stats, availability), history (partners, opponents, games, last rest), courts, mode, settings, seed; output = matches + resting list + diagnostics. Modes: Random, Balanced Elo, Mexicano, Americano, Fixed Partner. Shared selection step: choose who plays (fair play time / rest rotation), then pair/team per mode with a cost function (repeat partner, repeat opponent, Elo diff weights).
- **Acceptance**: hard constraints always hold; same seed ⇒ identical output; fairness bounds in simulations; Balanced team-Elo diff ≤ naive baseline; mode rules exactly as ADR-017 (Mexicano ranking/pairing 1+4 vs 2+3, Americano per-round rotation, Fixed Partner team rest rotation).
- **Tests**: invariant tests across many seeds and player/court counts (incl. < 4 players, players not multiple of 4, more courts than possible); 12p/2c/10r fairness simulation; repeat-partner minimization; Americano with a late joiner; Fixed Partner keeps teams and rotates resting teams with an odd team count.

## M3 — Database package (`packages/database`)
- **Scope**: Prisma schema from DATABASE.md, initial migration incl. raw SQL constraints, generated client export, seed script (ledger built via elo-engine).
- **Acceptance**: `prisma migrate dev` from scratch succeeds; seed runs; constraint tests prove duplicate registration, duplicate active rating txn, duplicate round number are rejected; swap via deferrable constraint works in a transaction.
- **Tests**: integration tests against Dockerized Postgres (test DB reset per suite).

## M4 — API foundation + admin auth
- **Scope**: Fastify app factory, Zod validation (via `@pbl/shared`), error handler + error codes, request-id + pino logging, health endpoint, **admin-only** auth (email + argon2id password, DB sessions, httpOnly cookie, login/logout/me, CSRF header), `requireAdmin` guard, `create-admin` CLI, idempotency helper, audit helper, rate limit on login.
- **Acceptance**: every mutating route returns 401 without an admin session; guest GETs work; validation errors → 400 with field details; login rate limit triggers; idempotency helper replays responses.
- **Tests**: `fastify.inject` route tests; auth flow tests (login, bad password, expired session, logout); idempotency unit/integration tests.

## M5 — Players & sessions API
- **Scope**: player CRUD (admin), public player list/profile basics; Open Play CRUD + lifecycle (private sessions hidden from guests); participants: admin add (single/multi)/remove, capacity → waiting list, promote, late join, early leave, unavailable; admin management endpoints.
- **Acceptance**: PRD FR-P1..3, FR-S1..5 via API.
- **Tests**: service integration tests (waiting list ordering, capacity, lifecycle transitions, private-session visibility, authz).

## M6 — Rounds: generation, manual build, swap
- **Scope**: `POST /sessions/:id/rounds` (idempotent, persists mode/settings/seed/version/snapshot), manual round build/edit, delete last unstarted round, match start and round start (all matches), swap endpoint with `round.version` optimistic concurrency.
- **Acceptance**: generated rounds satisfy constraints; double-submit ⇒ one round; all swap kinds work; swaps with started match → `409 MATCH_ALREADY_STARTED`; concurrent swaps → one `409 ROUND_CHANGED`.
- **Tests**: integration incl. parallel request tests; audit entries asserted.

## M7 — Results & rating ledger
- **Scope**: admin confirm with winner (idempotent, advisory lock), round confirm-all (single transaction), cancel, correct (mandatory reason), incremental + replay paths, projection updates, audit. No player submissions (ADR-014).
- **Acceptance**: PRD FR-R1..5 and Elo rules; concurrent confirms of same match apply once; out-of-order confirmation produces same ratings as in-order; correction replay equals fresh fold.
- **Tests**: integration (parallel confirm, confirm-all atomicity, late confirm, correction, cancel-confirmed); ledger-vs-fold consistency check utility.

## M8 — Leaderboard & profile API
- **Scope**: leaderboard (ranked/provisional), player stats (matches, W/L, win rate, peak), rating history series, monthly activity, recent matches.
- **Acceptance**: numbers match ledger; ranked threshold 10; pagination.
- **Tests**: integration with seeded ledger fixtures.

## M9 — Web foundation
- **Scope**: Next.js App Router app, Tailwind, shadcn/ui in `packages/ui`, layout + mobile nav, typed API client, `messages.ts` string module (English), admin login page, Home, Open Play List.
- **Acceptance**: pages render with real API; guest vs admin navigation (admin controls hidden for guests); Lighthouse accessibility ≥ 90 on these pages.
- **Tests**: component tests for client logic; first Playwright smoke (home → list).

## M10 — Open Play Detail & Participant Management
- **Scope**: public detail page (rounds, matches, session standings), admin participant management (search + multi-select add, remove, waitlist promote, mark left/unavailable).
- **Acceptance**: flows work on 375 px viewport; optimistic feedback; errors displayed by code.
- **Tests**: Playwright participant flow.

## M11 — Live Match Manager & Match Generator screens
- **Scope**: generator screen (mode, settings, seed optional, generate), live manager: courts as cards, resting list, tap-tap swap with optimistic update/rollback, start round/match, admin taps winning team → Confirm sheet, "Confirm all" for the round, correct/cancel with reason, polling refresh (read-only live view for guests).
- **Acceptance**: PRD FR-W1..4 and FR-R2..4; winner recorded in two taps; works one-handed; ≥ 44 px targets.
- **Tests**: unit tests for swap and winner-selection state machines; Playwright: generate → swap → start → select winner → confirm.

## M12 — Leaderboard, Player Profile, Admin Settings screens
- **Scope**: leaderboard (ranked/provisional tabs), profile with rating history chart (lightweight SVG, no chart lib unless justified), monthly activity, admin settings (defaults, add/deactivate admins, change password).
- **Acceptance**: PRD §5.7, §5.9.
- **Tests**: Playwright leaderboard updates after confirm.

## M13 — AYO link + manual paste import
- **Scope**: `ImportProvider` interface; `ayo-link` URL parser (offline); `manual-paste` parser; matcher (exact/alias/fuzzy suggestion); preview UI; commit (idempotent, aliases saved, participants upserted); external ref on session.
- **Acceptance**: PRD FR-A1..6; re-import creates no duplicates; no network calls to AYO.
- **Tests**: parser unit tests (example link and variants, messy pasted lists); integration test for repeated import.

## M14 — PWA & accessibility hardening
- **Scope**: manifest, icons, service worker (app shell, static caching, network-first GETs, offline banner), install prompt UX, a11y pass (focus, labels, contrast, reduced motion).
- **Acceptance**: installable (Lighthouse PWA checks); offline shows cached shell + offline state; axe checks pass on key screens.
- **Tests**: Playwright with `@axe-core/playwright` (justify dep) on key pages; SW smoke.

## M15 — VPS deployment & E2E
- **Scope**: production Dockerfiles (turbo prune), `docker-compose.yml` (nginx, web, api, postgres without published port, migrate, certbot, backup), nginx config (Let's Encrypt TLS, HTTP→HTTPS, gzip, cache headers, `/api` proxy), nightly `pg_dump` with 14-day retention, `docs/DEPLOYMENT.md` runbook (first deploy, `create-admin`, update, backup/restore, cert renewal).
- **Acceptance**: `docker compose up -d` on Addin's VPS serves the app over HTTPS; a restore from backup succeeds once; full golden-path Playwright suite passes against the compose stack; PRD §8 checklist signed off.
- **Tests**: full E2E suite; restore drill.

---

## Later (post-MVP, not scheduled)
- Player accounts: profile claiming, self-registration, player result submission with conflict flagging (admin confirmation still required).
- Bahasa Indonesia UI.
- Screenshot import (OCR → same preview pipeline).
- Official AYO API provider if AYO offers one / partnership.
- Realtime updates (SSE) instead of polling.
- Offline queued writes for results.
- Player merge tool UI (backend audit-safe merge).

## Top technical risks
1. **Elo replay correctness & concurrency** — out-of-order confirmations and corrections; mitigated by canonical order key, advisory lock, partial unique index, and fold-equivalence tests.
2. **AYO data access** — participant lists are not reachable via ordinary public access (see ADR-009); scraping would be brittle and contrary to AYO's robots policy. Mitigation: manual paste MVP behind provider interface.
3. **Swap atomicity with unique constraints** — Prisma lacks deferrable constraints; needs raw SQL migration and careful tx code.
4. **Scheduling quality vs. simplicity** — Mexicano/Americano semantics with variable attendance and late joins can conflict with fairness; rules fixed in ADR-017 and covered by simulation tests.
5. **Live-session UX on poor venue connectivity** — optimistic UI + idempotent writes; offline writes deferred.
6. **Multi-admin concurrency** — optimistic versioning on rounds/matches; polling staleness.
7. **Admin as single point of result entry** — every result depends on an admin being present and tapping; mitigated by two-tap entry and round "Confirm all"; player submissions are the post-MVP path.
8. **Self-hosted ops** — VPS disk/backup/TLS renewal are on Addin; mitigated by backup container, restore drill, and runbook.

## Resolved decisions (2026-11-07)
1. Auth: only admins log in (email + argon2id password, DB-session cookie); players have no accounts in MVP — ADR-005.
2. Result entry: admin-entered only (tap winner → Confirm, plus round "Confirm all"); no unauthenticated player submissions — ADR-014.
3. Hosting: Addin's self-hosted VPS, everything in Docker Compose + Nginx (Let's Encrypt), containerized Postgres with nightly backups — ADR-016.
4. Repo root is the monorepo root; package scope `@pbl/*` — ADR-002.
5. Corrections: full deterministic replay forward from the corrected match — ADR-006.
6. Canonical Elo order: session start → round → court, not confirmation time — ADR-015.
7. Bulk confirm: allowed per round as "Confirm all" (atomic) — ADR-014.
8. Generator mode rules: Mexicano ranks by session wins → win rate → Elo → seed, pairs 1+4 vs 2+3; Americano per-round rotation; Fixed Partner rotates resting teams — ADR-017.
9. Precision: store `Decimal(10,4)`, round each delta to 4 dp, display integers — ADR-010.
10. Players are admin-created; profile claiming is post-MVP — ADR-018.
11. AYO: one session per AYO event; manual paste is the MVP import workflow — ADR-009.
12. Privacy: display names, ratings, and history are public; no contact/PII stored; private sessions hidden from guests — ADR-019.
13. Language: English UI in MVP with centralized strings for later Bahasa Indonesia — ADR-020.
