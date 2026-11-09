#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Starting dev Postgres…"
pnpm db:up

echo "Applying migrations…"
pnpm db:generate
pnpm db:deploy

echo "Ensuring dev admin exists…"
pnpm --filter @pbl/api ensure-dev-admin

echo "Starting API (3001) and web (3000)…"
exec pnpm exec turbo run dev --filter=@pbl/api --filter=@pbl/web --parallel
