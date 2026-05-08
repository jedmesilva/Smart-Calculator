#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Build DATABASE_URL from Replit's PG env vars if not already set
if [ -z "$DATABASE_URL" ] && [ -n "$PGHOST" ] && [ -n "$PGUSER" ] && [ -n "$PGDATABASE" ]; then
  export DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:${PGPORT:-5432}/$PGDATABASE"
fi

pnpm --filter @workspace/db run push-force
