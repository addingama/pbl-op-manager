# PBL Open Play Manager — Product Requirements (PRD)

Status: Draft for approval (decisions resolved, see DECISIONS.md) · Owner: Addin · Last updated: 2026-11-07

## 1. Summary

A mobile-first, installable PWA for running padel **Open Play** sessions at PBL: registering participants, generating doubles matches across one or more courts, letting an admin swap players quickly before a match starts, recording Win/Loss results, and maintaining a **lifetime individual Elo leaderboard**.

## 2. Goals and non-goals

### Goals

- Run a live session from a phone with minimal taps (generate round → swap if needed → start → tap winner → confirm).
- Fair scheduling: everyone plays roughly equal time, rests rotate, repeat partners/opponents minimized.
- Trustworthy ratings: only admin-confirmed results affect Elo; history is immutable, auditable, and replayable.
- Accept AYO "main bareng" share links and participant lists without relying on undocumented AYO APIs.

### Non-goals (MVP)

- Score tracking (games/sets) in Elo. Win/Loss only.
- Payments, court booking, chat, push notifications, tournaments/brackets.
- Rating decay, team (pair) ratings, multiple rating pools.
- Automated AYO scraping or login-based AYO access. Screenshot/OCR import (design-only, later).
- Native mobile apps.
- **Player accounts/login** (ADR-005, ADR-014): players have no accounts in MVP. Consequently player self-registration and player result submission are deferred; admins do both.
- Multi-language UI (English only in MVP; strings centralized for later Bahasa Indonesia, ADR-020).

## 3. Users and roles

| Role                           | Can do (MVP)                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guest (unauthenticated)        | View public Open Play sessions, their rounds/matches, leaderboard, player profiles. Players at a venue use the app as Guests.                                |
| Admin (only role that logs in) | Everything: manage players, sessions, participants, waiting lists, rounds, matches, swaps, enter/correct/cancel results, AYO import, settings, other admins. |
| Player (post-MVP)              | Planned later: account, self-registration, submit winner for own matches (admin confirmation still required).                                                |

Authorization is always enforced server-side: every mutating endpoint requires an authenticated admin. Only admin-entered results are official and Elo-affecting.

## 4. Domain model (conceptual)

Open Play (session) → Rounds → Matches (one per court per round) → Teams (2) → Players (2 each). Players not assigned in a round are **resting** for that round.

## 5. Functional requirements

### 5.1 Players

- FR-P1 Admin creates/edits/deactivates players (display name only; no contact details or other PII stored in MVP, ADR-019). Profile claiming by players is post-MVP.
- FR-P2 Player profile: current Elo, rank or provisional status, matches played, W/L, win rate, peak Elo, rating history chart, monthly activity, recent matches.
- FR-P3 Duplicate prevention: normalized-name matching warnings on create and on import.

### 5.2 Open Play sessions

- FR-S1 Admin creates a session: title, date/time, venue, number of courts (≥1, editable while live), capacity (optional), visibility (public/private), format (Random, Balanced Elo, Mexicano, Americano, Fixed Partner), optional external reference (AYO; at most one session per AYO event).
- FR-S2 Registration: admin registers players (individually, multi-select, or via AYO/paste import). When capacity is reached, new registrations go to a **waiting list** (FIFO); admin can promote/reorder. Self-registration is post-MVP (no player accounts).
- FR-S3 Late join and early leave: participants can be added or marked "left" at any time; left players are excluded from future rounds but keep past matches.
- FR-S4 Participants can be marked temporarily unavailable (skip next round(s)).
- FR-S5 Session lifecycle: DRAFT → OPEN (registration) → LIVE → COMPLETED (or CANCELLED). Unlimited rounds while LIVE.

### 5.3 Round and match generation

- FR-G1 Admin generates the next round automatically or builds it manually (assign players to court slots).
- FR-G2 Modes (rules in ADR-017):
  - **Random** — random teams among players selected to play.
  - **Balanced Elo** — minimize team-average Elo difference per match.
  - **Mexicano** — round 1 Balanced Elo; later rounds rank players by session wins → session win rate → current Elo → seeded tiebreak, group consecutive 4s, pair 1st+4th vs 2nd+3rd.
  - **Americano** — per-round rotation (not a precomputed schedule, so late joins work), minimizing repeat partners first, then repeat opponents.
  - **Fixed Partner** — teams defined for the session; teams with fewest games/longest rest play; opponents chosen to minimize repeats then team-Elo difference; extra teams rest in rotation; unpaired players cannot be scheduled until the admin pairs them.
- FR-G3 Hard constraints: exactly 4 unique players per match; no player in two matches in the same round; only active, present participants.
- FR-G4 Soft objectives: fair play time and rest rotation (fewest games/longest rest play next); minimize repeated partners and opponents; Balanced minimizes team-average Elo difference.
- FR-G5 Reproducible: same inputs + seed ⇒ same output. Each round stores mode, settings, seed, and generator version.
- FR-G6 Round generation is idempotent (retries/double taps do not create duplicate rounds).
- FR-G7 Preview before commit is optional; the default is "generate and persist" with swaps available afterwards.

### 5.4 Player swap

- FR-W1 Before a match starts, Admin can swap any two slots in the same round: same team, opposite teams, different courts, or playing ↔ resting.
- FR-W2 Interaction: tap first player, tap second player → swap applied immediately and auto-persisted (optimistic UI with rollback on error). No regeneration, no forced rebalancing.
- FR-W3 Swaps involving a match that has started (or finished/cancelled) are blocked with a clear message.
- FR-W4 Every swap is audit-logged.

### 5.5 Results

- FR-R1 Win/Loss only: result = winning team (1 or 2).
- FR-R2 **Admin-entered only (MVP, ADR-014)**: on the match card the admin taps the winning team, then taps Confirm in a confirmation sheet → result is official and Elo is applied exactly once. Players tell the admin verbally at the court.
- FR-R3 Admin may "Confirm all" for a round where winners have been selected but not yet confirmed (one confirmation sheet listing every match), to save taps at the end of a round.
- FR-R4 Admin can cancel a match (no Elo) or correct a confirmed result with a mandatory reason (Elo recomputed by deterministic replay; ADR-006).
- FR-R5 All result actions are audit-logged (who, when, before/after, reason).
- FR-R6 (Post-MVP) Player submissions with conflict flagging once player accounts exist; admin confirmation stays required.

### 5.6 Elo

- Individual, lifetime. Initial rating 1000, K = 32, no decay.
- Team rating = average of its two players' ratings.
- Expected(A) = 1 / (1 + 10^((R_B − R_A)/400)); Delta(A) = 32 × (Result(A) − Expected(A)), Result ∈ {1, 0}.
- Both teammates receive the same delta; the opposing team receives −Delta(A).
- Parallel matches within a round use the pre-round rating snapshot.
- Canonical rating order is session start time → round number → court (not confirmation time), so late confirmations land in the right place (ADR-015).
- Player is **ranked** after 10 completed (confirmed, non-cancelled) matches; **provisional** before.
- Rating history is immutable; corrections are explicit, audited, and trigger a full deterministic replay from the corrected match forward — later ratings of other players may change, and history shows why (ADR-006).
- Ratings stored with decimal precision; displayed as rounded integers (ADR-010).
- Duplicate rating transactions and concurrent confirmation races are prevented.
- Monthly activity stats (matches, W/L per month) are separate from Elo.

### 5.7 Leaderboard

- Lifetime Elo ranking of ranked players; provisional players listed separately (or toggle).
- Columns: rank, name, Elo, provisional badge, matches played, W/L, win rate, peak Elo. Tap → player profile with rating history and monthly activity.
- Optional monthly activity view (most matches / wins this month) — does not change Elo.

### 5.8 AYO import

- FR-A1 Accept AYO share links (e.g. `https://link.ayo.co.id/l/main_bareng_293332_ref_ADDQEO`) and parse the external event ID (`293332`) and referral code.
- FR-A2 Store external event reference on the session (provider `AYO`, external ID, original URL). One session per AYO event; linking an already-linked event shows the existing session (ADR-009).
- FR-A3 MVP import = **manual paste** of participant names (one per line, tolerant of numbering/emoji/extra text).
- FR-A4 Preview/review step: each parsed name shows a suggested match to an existing PBL player (exact/alias/fuzzy) or "create new"; admin confirms.
- FR-A5 Safe repeated imports: re-importing the same list does not duplicate players or registrations.
- FR-A6 Never request or store AYO passwords/tokens. No undocumented endpoints. Implemented behind a provider interface so official API / other sources can be swapped in later.
- FR-A7 (Later, design only) Screenshot import with OCR → same preview step.

### 5.9 Settings (Admin)

- Default generator mode and settings, default courts, ranked threshold (fixed at 10 for MVP, displayed), public visibility defaults, admin user management (add/remove admins, change own password).

## 6. UX requirements

- Screens: Home, Open Play List, Open Play Detail, Participant Management, Live Match Manager, Match Generator, Leaderboard, Player Profile, Admin Settings, plus Admin Login.
- Mobile-first (360–430 px primary), responsive up to desktop.
- Touch targets ≥ 44×44 px; one tap to select winner, one tap to confirm.
- UI language: English; all user-facing strings in one messages module per app (ADR-020).
- Court and round clearly labeled (e.g. "Round 3 · Court 2"); resting players visible in the Live Match Manager.
- Installable PWA, offline app shell with a clear "offline" state (writes require connectivity in MVP).
- Accessibility: WCAG 2.1 AA contrast, keyboard operable, screen-reader labels, not color-only state.

## 7. Non-functional requirements

- Strict TypeScript; business logic in pure domain packages independent of UI/HTTP.
- All API inputs validated with Zod; meaningful error codes; structured logs.
- DB transactions for round generation, swaps, confirmation, corrections; idempotency keys for confirmation and round generation.
- Performance: Live Match Manager interactions < 300 ms server round-trip on venue 4G for typical sessions (≤ 40 players, ≤ 8 courts).
- Few dependencies; each new dependency justified in DECISIONS.md.

## 8. MVP acceptance criteria

The MVP is accepted when all of the following pass on a deployed (Docker Compose + Nginx) instance:

1. **Auth & roles**: Guest can view public sessions, the leaderboard, and player profiles without login; private sessions are hidden from guests; every mutating endpoint returns 401 without an admin session (verified by API tests); admin login is rate-limited; the first admin is created by a bootstrap command.
2. **Sessions**: Admin creates a session with N courts; admin registers players; capacity overflow goes to a waiting list; late join and early leave work and affect only future rounds.
3. **Generation**: Admin generates rounds in Random, Balanced Elo, Mexicano, Americano, and Fixed Partner modes. Every generated round satisfies hard constraints (4 unique players/match, no double-booking). The same seed and inputs reproduce the same round (unit-tested). Round stores mode, settings, seed, generator version. Double-submitting "generate" creates exactly one round.
4. **Fairness**: In a simulated 12-player/2-court/10-round session, max−min games played ≤ 1 and no player rests two rounds in a row when avoidable (unit-tested).
5. **Swap**: Admin swaps two slots (same team, opposite team, cross-court, playing↔resting) with two taps; change persists after reload; swaps involving a started match are rejected with a clear error.
6. **Results**: Admin selects a winner and confirms it (or "Confirm all" for a round); confirming twice or concurrently applies Elo once; cancel and correct (with reason) work and are audit-logged; corrections replay later ratings deterministically.
7. **Elo correctness**: Unit tests cover the formula (equal ratings ⇒ ±16), team averaging, same delta for teammates, zero-sum per match, pre-round snapshot for parallel matches, and deterministic replay after a correction (replay result equals a fresh fold over all confirmed results).
8. **Leaderboard/profile**: shows rank, provisional status (< 10 matches), matches, W/L, win rate, peak Elo, rating history, monthly activity — all consistent with the rating ledger.
9. **AYO import**: Pasting the example AYO link stores provider `AYO` + event ID `293332`; manual paste import shows a preview with player matching; importing the same list twice creates no duplicates.
10. **PWA & UX**: Lighthouse PWA installability passes; Live Match Manager usable one-handed on a 375 px viewport; Playwright E2E covers: admin login → create session → register → generate → swap → start → select winner → confirm → leaderboard updates.
11. **Deployment**: the Docker Compose stack (Nginx with Let's Encrypt TLS, web, api, Postgres) runs on Addin's VPS; Postgres is not exposed publicly; the nightly backup runs and a restore has been tested once.
12. **Quality gates**: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass in CI/locally; no `any` in domain packages.

## 9. Decisions

All previously open questions are resolved; see DECISIONS.md (ADR-002, ADR-005, ADR-006, ADR-009, ADR-010, ADR-014 – ADR-020).
