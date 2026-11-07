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

Recommendation: the repository root (`pbl-op-manager/`) **is** the monorepo root that the brief calls `pbl-openplay/` (see DECISIONS ADR-002, pending confirmation).

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
    results/              submissions, confirm, cancel, correct
    ratings/              ledger writer, replay, leaderboard queries
    imports/              providers/ (ayo-link, manual-paste), preview, commit
    audit/                audit log writer
    auth/                 login/logout/me
  lib/                    idempotency, transactions, locks, logger
```

- **routes.ts**: HTTP only — parse with Zod schemas from `@pbl/shared`, call service, map result to response.
- **service.ts**: application logic; orchestrates domain packages + repos inside transactions; enforces authorization via an explicit `Actor` argument (`{ userId, role, playerId? }`).
- **repo.ts**: Prisma queries only.
- Errors: domain/application errors are typed (`AppError { code, httpStatus, message, details }`), mapped centrally to JSON `{ error: { code, message, details } }`. Codes live in `@pbl/shared` so the UI can show precise messages (e.g. `MATCH_ALREADY_STARTED`, `RESULT_ALREADY_CONFIRMED`, `IDEMPOTENCY_CONFLICT`).
- Logging: Fastify's built-in pino, JSON in prod, request-id correlation, no PII beyond IDs.

### Key endpoints (sketch)

| Method | Path | Role |
|---|---|---|
| GET | /api/sessions, /api/sessions/:id | Guest |
| POST/PATCH | /api/sessions, /api/sessions/:id | Admin |
| POST/DELETE | /api/sessions/:id/participants[/:playerId] | Player (self) / Admin |
| POST | /api/sessions/:id/rounds (Idempotency-Key) | Admin |
| POST | /api/rounds/:id/swaps | Admin |
| POST | /api/matches/:id/start | Admin |
| POST | /api/matches/:id/submissions | Player (participant) |
| POST | /api/matches/:id/confirm (Idempotency-Key) | Admin |
| POST | /api/matches/:id/cancel, /api/matches/:id/correct | Admin |
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
3. Unique constraint `(matchId, playerId, ledgerVersion)` prevents duplicate transactions.

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

## 6. Auth (proposed — pending Addin's decision, ADR-005)

- API-owned sessions: `Session` table, opaque random token in httpOnly, Secure, SameSite=Lax cookie; CSRF protection via SameSite + custom header requirement on mutations.
- Login options under consideration: (a) email + password (argon2), (b) email magic link, (c) admin-issued invite links / PINs. Guests need no account.
- A `User` may be linked to one `Player`. Admin creates players who may never have accounts.

## 7. Deployment

- Docker Compose services: `nginx`, `web`, `api`, `postgres` (volume), optional `migrate` one-shot (`prisma migrate deploy`).
- Multi-stage Dockerfiles using `turbo prune` for minimal images.
- Backups: nightly `pg_dump` to host volume/off-site (scope in final milestone).
- Environment via `.env` (not committed); `.env.example` documented.

## 8. Testing strategy

| Layer | Tool | Focus |
|---|---|---|
| elo-engine, match-generator | Vitest | Formula, invariants, determinism, fairness simulations, replay equivalence |
| api services | Vitest + real Postgres (Docker) | Transactions, idempotency, concurrency (parallel confirm), authz |
| api routes | Vitest + `fastify.inject` | Validation, error mapping, role checks |
| web | Vitest (+ Testing Library) for logic-heavy components | Swap selection state, winner selection |
| E2E | Playwright (mobile viewport) | Golden path and swap/confirm flows |

Tooling: Node 22 LTS, pnpm (workspace), Turborepo pipelines `lint`, `typecheck`, `test`, `build`. ESLint flat config + Prettier.
