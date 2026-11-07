# Architecture Decision Records

Format: each ADR has Status (Proposed / Accepted / Pending input / Superseded), Context, Decision, Consequences. All are **Proposed** until Addin approves the plan.

---

## ADR-001 — Monorepo with pnpm workspaces + Turborepo
- **Status**: Proposed (from brief)
- **Context**: Web, API, and shared domain packages must share types and logic.
- **Decision**: pnpm workspaces, Turborepo for task orchestration/caching. Environment observed: Node v22.16.0, pnpm 12.16.1, Docker 29.8.1 available locally; no local `psql` (Postgres via Docker).
- **Consequences**: One lockfile; `turbo prune` for Docker builds. Pin `packageManager` in root `package.json`.

## ADR-002 — Repository root is the monorepo root
- **Status**: Pending input (Open question 3)
- **Context**: Brief shows `pbl-openplay/` as root; the repo folder is `pbl-op-manager/` and was empty (no git) at planning time.
- **Decision**: Place `apps/`, `packages/`, workspace files directly at repo root; package scope `@pbl/*`.
- **Consequences**: Simpler paths/CI. If a nested folder is preferred, only paths change.

## ADR-003 — Pure domain packages for Elo and scheduling
- **Status**: Proposed
- **Decision**: `elo-engine` and `match-generator` are pure, deterministic, I/O-free TypeScript; randomness only via injected seeded PRNG; versioned (`engineVersion`, `generatorVersion`) and recorded with outputs.
- **Consequences**: Exhaustive unit testing; reproducible rounds and replays; API orchestrates persistence.

## ADR-004 — API owns all business logic; web is a client
- **Status**: Proposed
- **Decision**: Fastify API is the only writer to the DB. Next.js uses server components for reads (calling the API) and client components for interactive screens. No Next.js server actions writing to the DB.
- **Consequences**: One authorization point; slightly more plumbing for reads.

## ADR-005 — Authentication approach
- **Status**: Pending input (Open question 1)
- **Options**: (a) email+password (argon2) — no external deps, some friction; (b) email magic link — needs SMTP provider; (c) Google OAuth — easy for players, adds provider setup; (d) phone/WhatsApp OTP — best fit locally but paid/vendor; (e) admin-issued invite link/PIN — minimal infra.
- **Proposal**: API-owned DB sessions with httpOnly cookies regardless of login method. Start with (a) or (e) for MVP, add (c) later. Avoid a heavyweight auth framework.

## ADR-006 — Elo ledger: append-only with superseding replay runs
- **Status**: Proposed (Open questions 4–5)
- **Decision**: `RatingTransaction` rows are immutable; corrections, cancellations of confirmed matches, and out-of-order confirmations trigger a `REPLAY` `RatingRun` from the earliest affected canonical position, superseding (not deleting) later rows. Canonical order = session start, session id, round number, court. All rating writes serialized by a Postgres advisory transaction lock; partial unique index prevents duplicate active transactions.
- **Rationale**: Players are disjoint within a round, so per-court sequential application equals the pre-round snapshot rule. Replay guarantees ratings always equal a pure fold of confirmed results.
- **Consequences**: A correction can retroactively change later ratings of other players (visible in history with run reason). Write volume is small, so global serialization is acceptable.

## ADR-007 — Minimal client data layer
- **Status**: Proposed
- **Decision**: No TanStack Query/Redux initially. Server components + typed fetch + local optimistic state for swaps/winners; polling on live screens.
- **Consequences**: Fewer deps; revisit if cache invalidation becomes painful.

## ADR-008 — Idempotency keys + natural-key backstops
- **Status**: Proposed
- **Decision**: `Idempotency-Key` header required for round generation, confirm, correct, import commit; stored in `IdempotencyRecord` in the same transaction; plus DB unique constraints and state-machine guards.

## ADR-009 — AYO import: manual paste MVP, offline link parsing, provider interface
- **Status**: Proposed (Open question 10)
- **Context** (investigated 2026-11-07 via ordinary public HTTP GET only):
  - `https://link.ayo.co.id/l/main_bareng_293332_ref_ADDQEO` → `302` to a Firebase Dynamic Link (`ayoindonesia.page.link`) whose params include `afl/ifl=https://ayo.co.id/main-bareng/id/293332` and `link=https://ayo.co.id?type=mabar&mabar_id=293332&referral_code=ADDQEO`; Android package `coid.ayo.ayo_mobile_app`.
  - The web fallback `https://ayo.co.id/main-bareng/id/293332` → `301` to the generic listing `https://ayo.co.id/main-bareng`; no event detail or participant list was publicly available for this event (it may be past/expired; public event pages appear to use slug URLs).
  - `https://ayo.co.id/robots.txt` disallows AI crawlers (GPTBot, ClaudeBot, CCBot, etc.) entirely and several paths for all agents.
  - No public, documented AYO API was found. Site JS references participant loading, but that is an undocumented internal endpoint and was not probed or used.
- **Decision**: Parse event ID and referral code locally from the URL (no network request). Participant data comes from manual paste (MVP). Providers: `ayo-link`, `manual-paste`, later `screenshot`, hypothetical `ayo-official-api` only if AYO provides one. Never collect AYO credentials or tokens.
- **Consequences**: Reliable, legally clean MVP; admin does one copy/paste per event.
- **Note**: Firebase Dynamic Links were shut down by Google in Aug 2025; AYO's short links still resolve via their own redirector, but the format may change — the parser accepts several URL shapes and falls back to manual entry of the event ID.

## ADR-010 — Rating precision
- **Status**: Pending input (Open question 8)
- **Decision**: Store ratings/deltas as `Decimal(10,4)`; compute in floating point within the engine with a fixed rounding step to 4 dp per transaction for determinism; display rounded integers.

## ADR-011 — Time zone
- **Status**: Proposed
- **Decision**: Store UTC; display and monthly buckets in `Asia/Jakarta`.

## ADR-012 — Dependency policy
- **Status**: Proposed
- **Decision**: Prefer platform/in-house for small utilities (seeded PRNG, fuzzy matching via simple Levenshtein, SVG chart). Allowed core deps: next, react, tailwindcss, shadcn/ui (radix), fastify (+ @fastify/cookie, @fastify/rate-limit), zod, prisma, vitest, playwright, argon2 (if password auth). Each additional dependency gets a line here.

## ADR-013 — Swap implementation
- **Status**: Proposed
- **Decision**: Swaps exchange `playerId` between two `RoundAssignment` rows in one transaction, with `UNIQUE(roundId, playerId) DEFERRABLE INITIALLY DEFERRED` (raw SQL) and `Round.version` optimistic concurrency. Blocked unless every involved match is `SCHEDULED`.

---

## Pending decisions (need Addin)
ADR-002 repo root · ADR-005 auth · ADR-006 replay semantics & canonical order · ADR-009 AYO workflow · ADR-010 precision · plus hosting, Mexicano/Americano rules, privacy, UI language (see ROADMAP open questions).
