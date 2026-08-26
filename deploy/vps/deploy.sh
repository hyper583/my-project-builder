#!/usr/bin/env bash
# Deploy the current main branch onto the VPS.
#
#   ssh mpb@your-server
#   cd /srv/my-project-builder && ./deploy/vps/deploy.sh
#
# Deliberately not a git hook or a CI job. Deploys here are occasional and
# deserve a person watching, because the failure that matters most — the worker
# not coming back — is silent in the product.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> Fetching"
git fetch origin
git reset --hard origin/main

# `--include=dev` is required. NODE_ENV=production makes npm omit
# devDependencies, and six of them are needed here — tailwindcss and
# @tailwindcss/postcss to build the stylesheet, and tsx to START THE WORKER.
# Without it the build succeeds and the worker fails on every boot.
echo "==> Installing"
npm ci --include=dev

echo "==> Generating the Prisma client"
npx prisma generate

# Before the new code serves traffic, never after.
echo "==> Applying migrations"
npx prisma migrate deploy

echo "==> Building"
npm run build

echo "==> Restarting"
sudo systemctl restart mpb-web mpb-worker

# The worker is the half that fails quietly, so it is checked rather than
# assumed. A project stuck at "Generating" reports no error.
sleep 3
systemctl is-active --quiet mpb-web   && echo "    web    running" || { echo "    web    FAILED"; journalctl -u mpb-web -n 30 --no-pager; exit 1; }
systemctl is-active --quiet mpb-worker && echo "    worker running" || { echo "    worker FAILED"; journalctl -u mpb-worker -n 30 --no-pager; exit 1; }

echo "==> Done. Confirm the worker is claiming jobs:  journalctl -u mpb-worker -f"
