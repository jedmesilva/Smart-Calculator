#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Use individual PGHOST env vars if available (Replit managed),
# falling back to DATABASE_URL for other environments.
if [ -n "$PGHOST" ] && [ -n "$PGUSER" ] && [ -n "$PGDATABASE" ]; then
  export DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:${PGPORT:-5432}/$PGDATABASE"
fi

pnpm --filter @workspace/db run push-force
