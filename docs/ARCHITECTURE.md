# Architecture

Status: Draft for approval · Last updated: 2026-11-07

## 1. Overview

```
 Browser (PWA, mobile)                    VPS / host (Docker Compose)
 ┌──────────────────────┐   HTTPS   ┌───────────────────────────────────────────┐
 │ Next.js web (App     │ ────────▶ │ Nginx (TLS, gzip, routing)                │
 │ Router, RSC + client │           │  ├─ /        → web  (Next.js, node)       │
 │ components, SW)      │           │  └─ /api/*   → api  (Fastify, node)       │
 └──────────────────────┘           │                    │                      │
                                    │                    ▼                      │
                                    │              PostgreSQL 16                │
                                    └───────────────────────────────────────────┘
```

- **web** renders UI and calls the API (server components fetch server-side with forwarded cookies; client components call `/api` same-origin). No business logic in web.
- **api** is the single owner of business rules, authorization, transactions, and persistence.
- Same origin behind Nginx ⇒ httpOnly session cookies, no CORS in production.

## 2. Repository layout

The repository root (`pbl-op-manager/`, remote `git@github.com:addingama/pbl-op-manager.git`) **is** the monorepo root that the brief calls `pbl-openplay/`; package scope `@pbl/*` (ADR-002, accepted).

```
.
├─ apps/
│  ├─ web/                 Next.js App Router, Tailwind, shadcn/ui, PWA
│  └─ api/                 Fastify HTTP adapter + application services
├─ packages/
│  ├─ shared/              Zod schemas (API contracts), enums, error codes, types
│  ├─ elo-engine/          Pure Elo math + ledger fold/replay (no I/O)
│  ├─ match-generator/     Pure scheduling algorithms, seeded RNG (no I/O)
│  ├─ database/            Prisma schema, migrations, client, seed
│  └─ ui/                  Shared React components (shadcn-based primitives)
├─ docker/                 Dockerfiles, nginx.conf
├─ docs/                   PRD, ARCHITECTURE, DATABASE, ROADMAP, DECISIONS
├─ docker-compose.yml
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
└─ package.json
```

### Dependency rules (enforced by lint/import boundaries)

```
web ──▶ shared, ui
api ──▶ shared, database, elo-engine, match-generator
elo-engine, match-generator ──▶ (nothing internal; maybe shared types)
database ──▶ (prisma only)
ui ──▶ (react, radix/shadcn deps)
```

Domain packages (`elo-engine`, `match-generator`) are pure functions: deterministic, no clock, no randomness except injected seeded RNG, no DB/HTTP. They are the primary unit-test targets.

## 3. API (apps/api) internal structure

```
src/
  server.ts               build Fastify instance (plugins, routes) — testable without listen
  plugins/                auth/session, error handler, request-id, rate limit
  modules/
    players/              routes.ts  service.ts  repo.ts
    sessions/             (open plays, participants, waiting list)
    rounds/               generate, manual build, swap
    results/              select/confirm, confirm-all, cancel, correct
    ratings/              ledger writer, replay, leaderboard queries
    imports/              providers/ (ayo-link, manual-paste), preview, commit
    audit/                audit log writer
    auth/                 admin login/logout/me, admin management
  cli/                    create-admin bootstrap command
  lib/                    idempotency, transactions, locks, logger
```

- **routes.ts**: HTTP only — parse with Zod schemas from `@pbl/shared`, call service, map result to response.
- **service.ts**: application logic; orchestrates domain packages + repos inside transactions; enforces authorization via an explicit `Actor` argument (`{ kind: 'guest' } | { kind: 'admin', userId }`), shaped so a `player` actor can be added post-MVP without changing service signatures.
- **repo.ts**: Prisma queries only.
- Errors: domain/application errors are typed (`AppError { code, httpStatus, message, details }`), mapped centrally to JSON `{ error: { code, message, details } }`. Codes live in `@pbl/shared` so the UI can show precise messages (e.g. `MATCH_ALREADY_STARTED`, `RESULT_ALREADY_CONFIRMED`, `IDEMPOTENCY_CONFLICT`).
- Logging: Fastify's built-in pino, JSON in prod, request-id correlation, no PII beyond IDs.

### Key endpoints (sketch)

| Method | Path | Role |
|---|---|---|
| POST | /api/auth/login, /api/auth/logout; GET /api/auth/me | Public / Admin |
| GET | /api/sessions, /api/sessions/:id (public sessions only for guests) | Guest |
| POST/PATCH | /api/sessions, /api/sessions/:id | Admin |
| POST/PATCH/DELETE | /api/sessions/:id/participants[/:playerId] | Admin |
| POST | /api/sessions/:id/rounds (Idempotency-Key) | Admin |
| POST | /api/rounds/:id/swaps | Admin |
| POST | /api/rounds/:id/start, /api/matches/:id/start | Admin |
| POST | /api/matches/:id/confirm { winnerTeam } (Idempotency-Key) | Admin |
| POST | /api/rounds/:id/confirm-all { results[] } (Idempotency-Key) | Admin |
| POST | /api/matches/:id/cancel, /api/matches/:id/correct { winnerTeam, reason } | Admin |
| GET | /api/leaderboard, /api/players/:id, /api/players/:id/rating-history | Guest |
| POST | /api/imports/ayo/parse-link, /api/imports/preview, /api/imports/commit | Admin |

## 4. Critical flows

### 4.1 Round generation (idempotent)
1. Admin taps "Generate" → client sends `POST /sessions/:id/rounds` with `Idempotency-Key` (UUID per tap intent).
2. API: begin tx → `SELECT … FOR UPDATE` on session row → check idempotency record → load active participants, history (partners/opponents/games/rests), ratings snapshot → call `match-generator` with seed (server-generated unless supplied) → insert Round, Matches, Assignments with `generatorVersion`, `settings`, `seed` → store idempotency response → commit.
3. Unique `(sessionId, roundNumber)` is the last line of defense against duplicate rounds.

### 4.2 Swap
`POST /rounds/:id/swaps { a: slotRef, b: slotRef, expectedRoundVersion }` → tx: lock round, verify both slots belong to round, verify involved matches are `SCHEDULED` → swap player IDs between two assignment rows → bump `round.version` → audit log. Optimistic concurrency via `round.version` returns `409 ROUND_CHANGED` so two admins can't clobber each other.

### 4.3 Result confirmation & Elo
1. `POST /matches/:id/confirm { winnerTeam }` with Idempotency-Key.
2. tx: acquire `pg_advisory_xact_lock(ELO_LOCK)` (serializes all rating writes — volume is tiny) → lock match row → if already confirmed with same winner, return existing (idempotent); with different winner → `409` (use "correct") → set official result → call ratings service:
   - If the match is the latest in canonical order (normal case), compute deltas from players' current ratings (equivalent to pre-round snapshot because a player appears at most once per round) and append rating transactions.
   - If it is out of order (an earlier round confirmed late) or a correction/cancellation of a confirmed match, run **deterministic replay** from the earliest affected position (see DATABASE.md §5).
3. Partial unique index on active `(matchId, playerId)` rating transactions prevents duplicates.
4. "Confirm all" runs the same logic for every match in the round inside one transaction (all-or-nothing).
5. Winner *selection* before Confirm is client-side state only; nothing is persisted until Confirm (ADR-014).

### 4.4 AYO import
`ImportProvider` interface:

```ts
interface ImportProvider {
  id: 'ayo-link' | 'manual-paste' | 'screenshot'; // future: 'ayo-official-api'
  canHandle(input: ImportInput): boolean;
  parse(input: ImportInput): Promise<ParsedImport>; // { externalRef?, participants: { rawName, externalId? }[] }
}
```

- `ayo-link`: parses the share URL locally (regex on `main_bareng_<id>_ref_<code>`, `ayo.co.id/main-bareng/id/<id>`, and `mabar_id=` params). **No network fetch in MVP** (see ADR-009).
- `manual-paste`: tolerant line parser (strips numbering, bullets, emoji, "(host)", phone numbers).
- Preview → matcher (exact normalized → alias table → fuzzy suggestion; never auto-merge fuzzy) → admin review → commit in one tx with an import batch keyed by `(provider, externalEventId, contentHash)`.

## 5. Web (apps/web)

- App Router; route groups `(public)` and `(admin)`; server components for read pages, client components for the Live Match Manager.
- Data: thin typed fetch client generated from `@pbl/shared` Zod schemas; TanStack Query not planned (see ADR-007) — server components + `router.refresh()` + small optimistic state for swaps/winners. Polling (5–10 s) on live screens for multi-device freshness; SSE later if needed.
- UI: Tailwind + shadcn/ui primitives in `packages/ui`.
- PWA: `app/manifest.ts`, hand-written service worker (app-shell + static asset caching, network-first for API GETs, no offline writes in MVP). Avoid heavy PWA plugins unless they prove necessary.

## 6. Auth (ADR-005, accepted)

- **Only admins log in.** Players have no accounts in MVP; everyone else is a Guest.
- Admin login: email + password, hashed with argon2id; login rate-limited per IP and per email.
- API-owned DB sessions: `AuthSession` table, opaque random token (sha256-hashed at rest) in an httpOnly, Secure, SameSite=Lax cookie; 30-day sliding expiry; logout deletes the row.
- CSRF: SameSite=Lax plus a required custom header (`X-Requested-With: pbl`) on mutations; same-origin only.
- First admin is created on the VPS with `pnpm --filter @pbl/api create-admin` (or `docker compose run api create-admin`); further admins are managed in Admin Settings.
- `Player` has no link to `User` in MVP; profile claiming is a post-MVP migration.

## 7. Deployment (ADR-016, accepted)

- Target: Addin's self-hosted VPS, everything in Docker Compose.
- Services: `nginx` (ports 80/443, TLS), `web` (Next.js standalone), `api` (Fastify), `postgres` (16, named volume, **no published port**), `migrate` one-shot (`prisma migrate deploy`) run before `api` starts, `certbot` (Let's Encrypt, webroot renewal), `backup` (nightly `pg_dump -Fc`, 14-day local retention).
- Postgres stays containerized: low volume, single host, no strong reason for managed DB. Backups should also be copied off the VPS (rsync/rclone target chosen by Addin at deploy time).
- Multi-stage Dockerfiles using `turbo prune` for minimal images; images built on the VPS (or pushed to GHCR later).
- Environment via `.env` on the VPS (not committed); `.env.example` documented. Runbook in `docs/DEPLOYMENT.md` (written in M15).

## 8. Testing strategy

| Layer | Tool | Focus |
|---|---|---|
| elo-engine, match-generator | Vitest | Formula, invariants, determinism, fairness simulations, replay equivalence |
| api services | Vitest + real Postgres (Docker) | Transactions, idempotency, concurrency (parallel confirm), authz |
| api routes | Vitest + `fastify.inject` | Validation, error mapping, role checks |
| web | Vitest (+ Testing Library) for logic-heavy components | Swap selection state, winner selection |
| E2E | Playwright (mobile viewport) | Golden path and swap/confirm flows |

Tooling: Node 22 LTS, pnpm (workspace), Turborepo pipelines `lint`, `typecheck`, `test`, `build`. ESLint flat config + Prettier.

## 9. Internationalization (ADR-020)

English-only UI in MVP. User-facing strings live in one `messages.ts` per app (web) and error messages map from error codes in `@pbl/shared`, so Bahasa Indonesia can be added later without touching components. No i18n library in MVP.
