#!/usr/bin/env bash
set -euo pipefail
: "${EDUTRACK_BACKUP_ROOT:=/var/backups/edutrack}"
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
exec /usr/bin/node /opt/edutrack/scripts/backup-production.js "${EDUTRACK_BACKUP_ROOT}/${stamp}"
