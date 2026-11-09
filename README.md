# PBL Open Play Manager

Padel open play sessions, live match management, and lifetime Elo rankings.

## Quick start (local)

From the repo root (requires Node 22, pnpm, and Docker for Postgres):

```bash
pnpm install
pnpm dev
```

`pnpm dev` (same as `pnpm start`) will create `.env` from `.env.example` if needed, start Postgres on `127.0.0.1:5433`, apply migrations, **create the dev admin if missing** (`SEED_ADMIN_*`), and run the API and web app. Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Sign in at `/login` with `admin@pbl.local` / `pbl-dev-admin` unless you changed `SEED_ADMIN_*` in `.env`.

Full demo data (optional, wipes DB): `pnpm db:seed`.

**Create a session (admin):** sign in → **Open Play** → **Create open play**.

Production VPS: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Agent context: [AGENTS.md](AGENTS.md).
