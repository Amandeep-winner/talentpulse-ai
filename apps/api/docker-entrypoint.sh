#!/bin/sh
set -e

echo "Deploying database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting TalentPulse API server..."
exec "$@"
