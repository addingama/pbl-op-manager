# AGENTS.md — PBL Open Play Manager

Single source of truth for AI coding agents (Cursor, Codex, Claude Code). `CLAUDE.md` only points here. Keep this file short; details live in `docs/`. If this file and `docs/` disagree, `docs/DECISIONS.md` wins — then fix this file.

## Purpose

Mobile-first PWA to run padel **Open Play** sessions at PBL: register participants, generate doubles matches across courts, let admins swap players before a match starts, record Win/Loss results, and maintain a **lifetime individual Elo leaderboard**.

## Stack

pnpm workspaces + Turborepo · Next.js App Router + TypeScript + Tailwind + shadcn/ui · Fastify + TypeScript · PostgreSQL 16 + Prisma · Zod · Vitest · Playwright · PWA (manifest + service worker) · Docker Compose + Nginx. Node 22. Strict TypeScript, few dependencies (new deps need a line in ADR-012).

## Monorepo layout (repo root = monorepo root, scope `@pbl/*`)

```
apps/web               Next.js UI (no business logic)
apps/api               Fastify: all business rules, authz, transactions
packages/shared        Zod API contracts, enums, error codes
packages/elo-engine    pure Elo math + ledger fold/replay (no I/O)
packages/match-generator  pure seeded scheduling (no I/O)
packages/database      Prisma schema, migrations, seed
packages/ui            shared shadcn-based components
docs/                  PRD, ARCHITECTURE, DATABASE, ROADMAP, DECISIONS
```

## Key decisions (summary — see docs/DECISIONS.md)

- **Auth**: only admins log in (email + argon2id, DB-session httpOnly cookie). Players have no accounts in MVP; everyone else is a read-only Guest. Every mutating endpoint requires an admin (ADR-005).
- **Results**: admin-entered only — tap winning team → Confirm; round "Confirm all" is atomic. No player/unauthenticated submissions in MVP (ADR-014).
- **Elo**: individual, lifetime; start 1000, K=32; team rating = average of 2; Expected(A)=1/(1+10^((RB−RA)/400)); Delta=32×(Result−Expected); teammates get the same delta; no decay; ranked after 10 completed matches. Pre-round snapshot for parallel matches. Canonical order = session start → round → court (ADR-015). Append-only ledger; corrections/late confirms trigger deterministic replay forward (ADR-006). Decimal(10,4) storage, integer display (ADR-010). Idempotent confirmation + advisory lock.
- **Database**: Prisma 7 + `@prisma/adapter-pg`, UUIDv7 ids, `timestamptz`; deferrable `UNIQUE(roundId, playerId)` + partial uniques/CHECKs in raw SQL (ADR-023).
- **Generator**: Random, Balanced Elo, Mexicano, Americano, Fixed Partner; seeded and reproducible; settings + seed + version stored per round (ADR-017).
- **Swaps**: tap-tap swap of any two slots in a round before matches start; no regeneration (ADR-013).
- **AYO import**: parse share link locally (event ID, referral code); participants via **manual paste** with preview + player matching; one session per AYO event; behind an `ImportProvider` interface (ADR-009).
- **Hosting**: Addin's VPS, everything in Docker Compose + Nginx (Let's Encrypt), containerized Postgres, nightly backups (ADR-016).
- **Agent context**: this file is the shared context for all agents (ADR-021).

## Rules for agents

1. **One milestone at a time** (docs/ROADMAP.md). For each: state scope, implement the smallest complete solution, add tests, run `pnpm lint && pnpm typecheck && pnpm test`, report changed files + verification steps, then **stop and wait for Addin's approval**.
2. Do not start a milestone or expand scope without approval. No features outside the PRD.
3. **Never invent AYO endpoints**, never scrape behind auth, never request or store AYO passwords/tokens.
4. Business logic stays out of UI and HTTP handlers: pure domain packages + API services. Validate every API input with Zod; authorize server-side; use DB transactions for critical operations; idempotency keys for round generation, confirm, confirm-all, correct, import commit.
5. Record new architectural decisions as an ADR in docs/DECISIONS.md and update this file's summary if it changes.
6. Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). Do not push unless asked.
7. React: function components only.

## Commands

**Local app (one command from repo root):** `pnpm dev` (alias `pnpm start`) — copies `.env` from `.env.example` if missing, starts dev Postgres, runs migrations, then API + web together.

```bash
pnpm install                      # Node 22, pnpm 12 (see packageManager)
pnpm lint && pnpm typecheck && pnpm test   # quality gates (Turborepo)
pnpm format:check                 # Prettier
pnpm db:up / pnpm db:down         # dev Postgres 16 on 127.0.0.1:5433 (docker-compose.dev.yml)
pnpm db:migrate / pnpm db:seed    # prisma migrate dev / deterministic dev seed (wipes dev data)
pnpm db:generate                  # Prisma client (Turborepo runs it before lint/typecheck/test)
pnpm create-admin                 # bootstrap first admin (CREATE_ADMIN_* or --email/--password)
pnpm dev                          # full local stack (see above); open http://127.0.0.1:3000
# Admin: sign in → Open Play → Create open play (/sessions/new)
pnpm --filter @pbl/api start      # API only on PORT (default 3001)
pnpm --filter @pbl/web dev        # web only on 3000
```

`pnpm test` needs Postgres running (`pnpm db:up`): `@pbl/database` and `@pbl/api` integration tests recreate `<db>_test` each run (Turborepo runs package tests with `--concurrency=1` to avoid parallel DB resets). Raw-SQL constraints live in the init migration (docs/DATABASE.md §4, ADR-023); keep `prisma migrate diff` empty.

## Docs

- [docs/PRD.md](docs/PRD.md) — requirements, roles, MVP acceptance criteria (§8)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — services, module structure, flows, deployment
- [docs/DATABASE.md](docs/DATABASE.md) — Prisma schema, rating ledger, idempotency, audit, AYO refs
- [docs/ROADMAP.md](docs/ROADMAP.md) — milestones M0–M15, risks, resolved decisions
- [docs/DECISIONS.md](docs/DECISIONS.md) — ADR log (authoritative)
