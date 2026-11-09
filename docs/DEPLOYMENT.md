# Deployment runbook (M15)

Production stack: **Docker Compose** on Addin's VPS — Postgres (internal only), API, Next.js web, Nginx (TLS via Certbot), nightly `pg_dump` backups (14-day retention).

## Prerequisites

- VPS with Docker Engine and Compose v2.
- DNS `A`/`AAAA` for `${DOMAIN}` pointing at the VPS.
- Ports **80** and **443** open to the internet (for ACME and HTTPS).
- Git clone of this repo on the server (or CI that ships images).

## 1. Configure environment

```bash
cp .env.production.example .env
# Edit: DOMAIN, CERTBOT_EMAIL, POSTGRES_PASSWORD, etc.
```

Never commit `.env`.

## 2. Build and start (HTTP first)

Bring the stack up. Initially Nginx serves **HTTP only** (`docker/nginx/conf.d/pbl-http.conf`) so you can obtain certificates.

```bash
docker compose build
docker compose up -d
docker compose ps
```

Check health:

```bash
curl -sS "http://127.0.0.1/api/health"
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1/"
```

(Use your public `DOMAIN` once DNS propagates.)

## 3. Let's Encrypt (first certificate)

With Nginx running and port 80 reachable:

```bash
set -a && source .env && set +a
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$CERTBOT_EMAIL" \
  --agree-tos --no-eff-email
```

### Enable HTTPS

1. Create TLS config from the example (replace domain):

   ```bash
   sed "s/__DOMAIN__/${DOMAIN}/g" docker/nginx/conf.d/https.conf.example > docker/nginx/conf.d/https.conf
   ```

2. **Disable** the HTTP-only site so port 80 is not double-defined:

   ```bash
   mv docker/nginx/conf.d/pbl-http.conf docker/nginx/conf.d/pbl-http.conf.disabled
   ```

3. Mount `https.conf` — add this volume under `nginx` in `docker-compose.yml` (or override file):

   ```yaml
   - ./docker/nginx/conf.d/https.conf:/etc/nginx/conf.d/https.conf:ro
   ```

4. Reload:

   ```bash
   docker compose up -d nginx
   ```

The `certbot` service renews certificates automatically (`certbot renew --webroot` every 12h).

## 4. Create the first admin

```bash
docker compose run --rm \
  -e CREATE_ADMIN_EMAIL='admin@example.com' \
  -e CREATE_ADMIN_PASSWORD='your-secure-password' \
  -e CREATE_ADMIN_NAME='Addin' \
  api pnpm --filter @pbl/api create-admin
```

Or pass flags:

```bash
docker compose run --rm api pnpm --filter @pbl/api create-admin \
  --email admin@example.com --password 'your-secure-password' --name Addin
```

## 5. Updates (new release)

```bash
git pull
docker compose build
docker compose up -d
```

`migrate` runs on every `up` when the image changes; failed migrations block `api` start.

## 6. Backups

The `backup` container:

- Runs an immediate dump on start, then **03:15 UTC** daily (cron).
- Writes `pbl_<timestamp>.sql.gz` to the `backup-data` volume.
- Deletes files older than `BACKUP_RETENTION_DAYS` (default **14**).

List backups:

```bash
docker compose exec backup ls -la /backups
```

### Restore drill (once per environment)

**Warning:** overwrites current data.

```bash
# Stop writers
docker compose stop api web nginx

# Pick a backup file
BACKUP_FILE=pbl_20261109T031500Z.sql.gz

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();"

gunzip -c "/path/from/volume/${BACKUP_FILE}" | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

docker compose up -d
```

To copy a backup from the volume to the host:

```bash
docker compose run --rm -v backup-data:/backups -v "$PWD":/out alpine \
  cp "/backups/${BACKUP_FILE}" /out/
```

## 7. Playwright E2E against the stack

On a machine that can reach the deployed URL (or local compose on HTTP):

```bash
export BASE_URL="https://${DOMAIN}"
export SKIP_E2E=0
# If using seeded dev admin on a staging copy only:
export SEED_ADMIN_EMAIL=...
export SEED_ADMIN_PASSWORD=...
pnpm --filter @pbl/web test:e2e
```

For local compose without TLS, use `BASE_URL=http://127.0.0.1` while `pbl-http.conf` is active.

## 8. Troubleshooting

| Symptom | Check |
|--------|--------|
| 502 from Nginx | `docker compose logs web api nginx` |
| Migrations fail | `docker compose run --rm migrate` logs; `DATABASE_URL` |
| Cookies not set | HTTPS required in production (`secure` cookies); use TLS config |
| Cert renew fails | Port 80 ACME path; `docker compose logs certbot` |

## 9. PRD §8 deployment checklist

- [ ] Compose up on VPS; Postgres **not** exposed publicly (`docker compose ps` — no postgres ports).
- [ ] HTTPS with valid Let's Encrypt cert.
- [ ] Bootstrap admin created via `create-admin`.
- [ ] Nightly backup volume contains `.sql.gz` files.
- [ ] Restore drill completed once and documented.
- [ ] Golden-path E2E (or manual PRD walkthrough) against deployed URL.
