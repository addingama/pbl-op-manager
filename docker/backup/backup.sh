#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/pbl_${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

pg_dump -h "${PGHOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl | gzip -9 >"${FILE}"
echo "Wrote ${FILE}"

find "${BACKUP_DIR}" -type f -name 'pbl_*.sql.gz' -mtime +"${RETENTION_DAYS}" -print -delete
