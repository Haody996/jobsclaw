#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "→ Building containers..."
docker compose build

echo "→ Running database migrations..."
docker compose run --rm app npx prisma migrate deploy

echo "→ Restarting services..."
docker compose up -d

echo "✓ Deployed → https://jobsclaw.net"
