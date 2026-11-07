# Roadmap

Status: Draft for approval · Last updated: 2026-11-07

Process per milestone (after plan approval): implement one milestone → smallest complete solution → tests → run `pnpm lint && pnpm typecheck && pnpm test` → changed-file summary + verification steps → **wait for Addin's approval** before the next milestone.

MVP = M0 through M15. MVP acceptance criteria: see PRD.md §8.

---

## M0 — Monorepo foundation
- **Scope**: pnpm workspace + Turborepo; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESLint flat config + Prettier; Vitest workspace config; empty package skeletons (`apps/web`, `apps/api`, `packages/{shared,elo-engine,match-generator,database,ui}`) each with `lint/typecheck/test` scripts; `docker-compose.dev.yml` with Postgres only; `.env.example`; `.nvmrc` (Node 22); git init + `.gitignore`.
- **Acceptance**: `pnpm install` clean; `pnpm lint`, `pnpm typecheck`, `pnpm test` succeed across all packages via turbo; `docker compose -f docker-compose.dev.yml up -d` starts Postgres.
- **Tests**: one trivial test per package to prove wiring.

## M1 — Elo engine (`packages/elo-engine`)
- **Scope**: pure functions `expectedScore`, `teamRating`, `matchDeltas`, `applyRound` (pre-round snapshot), `foldLedger(initial, orderedResults)`; ranked/provisional helper; constants (1000, 32, 400, ranked threshold 10); engine version export.
- **Acceptance**: matches PRD formulas; zero-sum per match; teammates equal delta; deterministic.
- **Tests**: equal ratings ⇒ ±16; known asymmetric cases; team averaging; parallel-matches snapshot; fold determinism; replay-after-correction equals fresh fold; property-style randomized checks (seeded, no extra deps).

## M2 — Match generator (`packages/match-generator`)
- **Scope**: seeded PRNG (e.g. mulberry32/sfc32, in-house); input = participants (id, rating, session stats, availability), history (partners, opponents, games, last rest), courts, mode, settings, seed; output = matches + resting list + diagnostics. Modes: Random, Balanced Elo, Mexicano, Americano, Fixed Partner. Shared selection step: choose who plays (fair play time / rest rotation), then pair/team per mode with a cost function (repeat partner, repeat opponent, Elo diff weights).
- **Acceptance**: hard constraints always hold; same seed ⇒ identical output; fairness bounds in simulations; Balanced team-Elo diff ≤ naive baseline; Mexicano round ≥2 groups by session wins.
- **Tests**: invariant tests across many seeds and player/court counts (incl. < 4 players, players not multiple of 4, more courts than possible); 12p/2c/10r fairness simulation; repeat-partner minimization; Fixed Partner keeps teams.

## M3 — Database package (`packages/database`)
- **Scope**: Prisma schema from DATABASE.md, initial migration incl. raw SQL constraints, generated client export, seed script (ledger built via elo-engine).
- **Acceptance**: `prisma migrate dev` from scratch succeeds; seed runs; constraint tests prove duplicate registration, duplicate active rating txn, duplicate round number are rejected; swap via deferrable constraint works in a transaction.
- **Tests**: integration tests against Dockerized Postgres (test DB reset per suite).

## M4 — API foundation + auth
- **Scope**: Fastify app factory, Zod validation (via `@pbl/shared`), error handler + error codes, request-id + pino logging, health endpoint, auth per ADR-005 decision (sessions, login/logout/me), role guard helpers, idempotency helper, audit helper, rate limit on auth.
- **Acceptance**: unauthenticated → 401 on protected, 403 on admin-only for players; validation errors → 400 with field details; idempotency helper replays responses.
- **Tests**: `fastify.inject` route tests; auth flow tests; idempotency unit/integration tests.

## M5 — Players & sessions API
- **Scope**: player CRUD (admin), public player list/profile basics; Open Play CRUD + lifecycle; participants: self-join/leave, admin add/remove, capacity → waiting list, promote, late join, early leave, unavailable.
- **Acceptance**: PRD FR-P1..3, FR-S1..5 via API.
- **Tests**: service integration tests (waiting list ordering, capacity, lifecycle transitions, authz).

## M6 — Rounds: generation, manual build, swap
- **Scope**: `POST /sessions/:id/rounds` (idempotent, persists mode/settings/seed/version/snapshot), manual round build/edit, delete last unstarted round, match start, swap endpoint with `round.version` optimistic concurrency.
- **Acceptance**: generated rounds satisfy constraints; double-submit ⇒ one round; all swap kinds work; swaps with started match → `409 MATCH_ALREADY_STARTED`; concurrent swaps → one `409 ROUND_CHANGED`.
- **Tests**: integration incl. parallel request tests; audit entries asserted.

## M7 — Results & rating ledger
- **Scope**: submissions (participants only, upsert), conflict detection, admin confirm (idempotent, advisory lock), cancel, correct (with reason), incremental + replay paths, projection updates, audit.
- **Acceptance**: PRD FR-R1..6 and Elo rules; concurrent confirms of same match apply once; out-of-order confirmation produces same ratings as in-order; correction replay equals fresh fold.
- **Tests**: integration (parallel confirm, late confirm, correction, cancel-confirmed); ledger-vs-fold consistency check utility.

## M8 — Leaderboard & profile API
- **Scope**: leaderboard (ranked/provisional), player stats (matches, W/L, win rate, peak), rating history series, monthly activity, recent matches.
- **Acceptance**: numbers match ledger; ranked threshold 10; pagination.
- **Tests**: integration with seeded ledger fixtures.

## M9 — Web foundation
- **Scope**: Next.js App Router app, Tailwind, shadcn/ui in `packages/ui`, layout + mobile nav, typed API client, auth pages, Home, Open Play List.
- **Acceptance**: pages render with real API; guest vs player vs admin navigation; Lighthouse accessibility ≥ 90 on these pages.
- **Tests**: component tests for client logic; first Playwright smoke (home → list).

## M10 — Open Play Detail & Participant Management
- **Scope**: detail page (rounds, matches, standings), join/leave buttons, admin participant management (add, remove, waitlist promote, mark left/unavailable).
- **Acceptance**: flows work on 375 px viewport; optimistic feedback; errors displayed by code.
- **Tests**: Playwright participant flow.

## M11 — Live Match Manager & Match Generator screens
- **Scope**: generator screen (mode, settings, seed optional, generate), live manager: courts as cards, resting list, tap-tap swap with optimistic update/rollback, start match, winner selection (players submit; admin confirm one tap), conflict badges, polling refresh.
- **Acceptance**: PRD FR-W1..4 and minimal-tap winners; works one-handed; ≥ 44 px targets.
- **Tests**: unit tests for swap selection state machine; Playwright: generate → swap → submit → confirm.

## M12 — Leaderboard, Player Profile, Admin Settings screens
- **Scope**: leaderboard (ranked/provisional tabs), profile with rating history chart (lightweight SVG, no chart lib unless justified), monthly activity, admin settings (defaults, admins).
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

## M15 — Deployment & E2E
- **Scope**: production Dockerfiles (turbo prune), `docker-compose.yml` (nginx, web, api, postgres, migrate), nginx config (TLS-ready, gzip, cache headers, `/api` proxy), backup script, runbook in docs.
- **Acceptance**: `docker compose up` on a clean host serves the app; full golden-path Playwright suite passes against the compose stack; PRD §8 checklist signed off.
- **Tests**: full E2E suite.

---

## Later (post-MVP, not scheduled)
- Screenshot import (OCR → same preview pipeline).
- Official AYO API provider if AYO offers one / partnership.
- Realtime updates (SSE) instead of polling.
- Offline queued writes for results.
- Player merge tool UI (backend audit-safe merge).

## Top technical risks
1. **Elo replay correctness & concurrency** — out-of-order confirmations and corrections; mitigated by canonical order key, advisory lock, partial unique index, and fold-equivalence tests.
2. **AYO data access** — participant lists are not reachable via ordinary public access (see ADR-009); scraping would be brittle and contrary to AYO's robots policy. Mitigation: manual paste MVP behind provider interface.
3. **Swap atomicity with unique constraints** — Prisma lacks deferrable constraints; needs raw SQL migration and careful tx code.
4. **Scheduling quality vs. simplicity** — Mexicano/Americano semantics with variable attendance and late joins can conflict with fairness; needs agreed rules (open question) and simulation tests.
5. **Live-session UX on poor venue connectivity** — optimistic UI + idempotent writes; offline writes deferred.
6. **Multi-admin concurrency** — optimistic versioning on rounds/matches; polling staleness.
7. **Auth friction for players** — wrong choice reduces participation in result submission.

## Open questions for Addin
1. **Auth**: email+password, email magic link (needs SMTP), Google sign-in, WhatsApp/phone OTP (paid), or admin-issued invite links/PINs? Do most players need accounts at all, or is admin-only result entry acceptable for MVP?
2. **Hosting**: which VPS/provider and domain? Is a managed Postgres preferred over containerized Postgres? TLS via Let's Encrypt (certbot) in Nginx OK?
3. **Repo root**: use this repo (`pbl-op-manager/`) as the monorepo root instead of a nested `pbl-openplay/` folder? Package scope `@pbl/*` OK?
4. **Elo on corrections**: confirm full deterministic replay from the affected match forward (later players' ratings may change retroactively) vs. a single compensating adjustment.
5. **Canonical Elo order**: by session start time + round + court (proposed) vs. by confirmation time.
6. **Result submission**: is one participant's submission enough to show "pending", with admin confirm always required (proposed)? Should admin be able to bulk-confirm a round where all submissions agree?
7. **Mexicano/Americano rules**: Mexicano ranking by session wins with Elo tiebreak? Americano: fixed schedule computed upfront vs. per-round rotation (per-round proposed, due to late joins)? Fixed Partner with odd teams — resting team rotation OK?
8. **Precision**: display rounded integer Elo while storing decimals (proposed)?
9. **Players without accounts**: can the admin create players who later "claim" their profile?
10. **AYO**: one session per AYO event (unique ref) OK? Is pasting the participant list from the AYO app acceptable as the MVP workflow?
11. **Privacy**: are player names/profiles public to guests? Any minors?
12. **Language**: UI in English, Bahasa Indonesia, or both?
