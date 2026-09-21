#!/bin/sh
set -eu

if [ "${VELCLAWHOST_STATE_STORE:-file}" = "postgres" ]; then
  : "${DATABASE_URL:?DATABASE_URL is required when using postgres state}"
  echo "Waiting for PostgreSQL..."
  until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
    sleep 2
  done

  echo "Applying VelclawHost database migrations..."
  for migration in /app/db/migrations/*.sql; do
    [ -f "$migration" ] || continue
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$migration"
  done
fi

exec node dist/server.cjs
