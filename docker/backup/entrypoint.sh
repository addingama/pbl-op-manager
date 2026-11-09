#!/bin/sh
set -eu

# Nightly backup at 03:15 UTC (cron expression: minute hour dom month dow)
CRON_EXPR="${BACKUP_CRON:-15 3 * * *}"

echo "${CRON_EXPR} /backup.sh >> /var/log/backup.log 2>&1" >/etc/crontabs/root
/backup.sh
echo "Backup sidecar started (cron: ${CRON_EXPR})."
crond -f -l 2
