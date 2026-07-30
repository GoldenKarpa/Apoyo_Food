#!/usr/bin/env bash
# deploy.sh — one-command update for Apoyo Food on the VPS.
#
# Usage — run directly as root, UNWRAPPED:
#   bash /home/user/web/food.apoyolime.com/private/apoyo-food/deploy.sh
#
# ⚠ Do NOT wrap this whole invocation in `su -s /bin/bash - user -c '...'`
# (ecosystem ruling E6). Salon's own deploy.sh hit exactly that and hung
# indefinitely on a bare `Password:` prompt with no useful error: every step
# below that needs `user`'s file ownership does its own individual `su`, and
# `user-pm2`'s wrapper does its own internal su/sudo to reach the `user`
# account. Root can do that password-free; a non-root caller re-asserting
# itself cannot.
#
# This is a REDEPLOY script, not a bootstrap one — it assumes `food-web`
# already exists under user-pm2 (DEPLOYMENT.md's one-time `user-pm2 start ...`
# is what creates it; a bare `restart` here reuses whatever binary/cwd/args
# that original start call gave PM2, deliberately never re-specified here).
#
# No background processes yet: `food-sweep` (Fresh Today expiry, stale-order
# expiry) arrives with Slice 15 and is wired into prod at Slice 19 — a restart
# line for it belongs here then, not now.
#
# Diff-aware pattern ported from Salon's deploy.sh (E5): skip `npm ci` when the
# lockfile didn't change; always run `prisma migrate deploy` regardless, since
# it is idempotent and catches drift a file-diff heuristic could miss.
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "deploy.sh must be run as root (unwrapped — see the usage comment" >&2
  echo "at the top of this file for why). Re-run as: sudo bash $0" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# This box's *system* node is EOL 18 — node 22 lives in the `user` account's own
# nvm (the same one portal-web's and Apparel's deploy.sh source). Sourced
# explicitly for every step rather than assumed present in a login shell's
# default PATH.
NVM_LOAD='export NVM_DIR=/home/user/.nvm; [ -s $NVM_DIR/nvm.sh ] && . $NVM_DIR/nvm.sh; nvm use 22 >/dev/null 2>&1;'

# Runs one command as `user`, in $APP_DIR, on node 22. Used for every step that
# writes into the checkout (git pull, npm ci, prisma, next build) — those files
# must stay owned by `user`. If root writes into the checkout, a later `git
# pull` as `user` fails with "Permission denied" creating a new directory, and
# a root-run `git` can also trip git's "dubious ownership" guard (E8 #1).
run_as_user() {
  su -s /bin/bash - user -c "$NVM_LOAD cd '$APP_DIR' && $1"
}

echo ""
echo "=== Apoyo Food deploy — $(date '+%Y-%m-%d %H:%M:%S') ==="

# ── 1. Pull ───────────────────────────────────────────────────────────────
echo ""
echo "[1/6] Pulling latest from origin/main..."
run_as_user "GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=accept-new' git pull"

# What changed between the old HEAD and the new one. Read-only, so it runs
# directly — root can always read the repo. Empty when the pull was a no-op;
# every later step degrades gracefully in that case.
CHANGED=$(cd "$APP_DIR" && git diff HEAD@{1} HEAD --name-only 2>/dev/null || true)

# ── 2. Dependencies ───────────────────────────────────────────────────────
echo ""
if echo "$CHANGED" | grep -q "^package-lock\.json$"; then
  echo "[2/6] package-lock.json changed — running npm ci..."
  run_as_user "npm ci"
else
  echo "[2/6] package-lock.json unchanged — skipping npm ci"
fi

# ── 3. Migrations ─────────────────────────────────────────────────────────
echo ""
if echo "$CHANGED" | grep -q "^prisma/migrations/"; then
  echo "[3/6] New migration files detected in this pull."
else
  echo "[3/6] No new migration files detected in this pull."
fi
echo "      Running prisma migrate deploy anyway — idempotent, reports"
echo "      \"No pending migrations\" when there is genuinely nothing to do."
# ⚠ The init migration creates the `unaccent` and `pg_trgm` extensions, which
# require SUPERUSER. The app role cannot do it — DEPLOYMENT.md §2 has the
# one-time `sudo -u postgres psql -d apoyo_food -c 'CREATE EXTENSION ...'`
# step that must run BEFORE the first migrate. `IF NOT EXISTS` makes the
# pre-created case a clean no-op on every deploy after that.
run_as_user "npx prisma migrate deploy"
run_as_user "npx prisma generate"

# ── 4. Env-var check ──────────────────────────────────────────────────────
# Every process.env reference in the app vs. every key actually defined in
# .env (ruling E5 — Salon shipped twice with a var missing from its runbook).
# Warns, does not block: a missing var breaks the one feature that reads it,
# not the build or the restart.
echo ""
echo "[4/6] Checking .env against process.env references in the code..."
cd "$APP_DIR"
NEEDED=$(grep -rhoE 'process\.env\.[A-Z_][A-Z0-9_]*' app lib i18n middleware.ts next.config.ts scripts 2>/dev/null \
  | sed 's/process\.env\.//' | sort -u)
if [ -f .env ]; then
  DEFINED=$(grep -oE '^[A-Z_][A-Z0-9_]*=' .env | sed 's/=$//' | sort -u)
else
  DEFINED=""
fi
# NODE_ENV is set by the Next runtime itself and must never be hand-written to
# .env — lib/session.ts derives the session cookie NAME from it, and it has to
# agree with portal-web, which derives it the same way. See .env.example's own
# note. Everything else flagged here is worth reading rather than reacting to
# its count: NEXT_PUBLIC_ASSET_HOST, UPLOADS_BASE_PATH and
# NEXT_PUBLIC_MEDIA_BASE_URL all have code-level fallbacks, but the first two
# genuinely MUST be set in this app's prod .env (DEPLOYMENT.md §2).
MISSING=$(comm -23 <(echo "$NEEDED") <(echo "$DEFINED") | grep -v '^NODE_ENV$' || true)
if [ -n "$MISSING" ]; then
  echo "      WARNING — referenced in code but missing from .env (see the"
  echo "      script comment above for which of these are expected/fine):"
  echo "$MISSING" | sed 's/^/        - /'
else
  echo "      OK — every referenced var is present in .env"
fi

# ── 5. Build ──────────────────────────────────────────────────────────────
echo ""
echo "[5/6] Building Next.js app..."
run_as_user "npm run build"

# ── 6. Restart food-web ───────────────────────────────────────────────────
# Unwrapped/direct — user-pm2's wrapper does the su internally; see the
# top-of-file usage comment for why wrapping the whole script breaks that.
echo ""
echo "[6/6] Restarting food-web..."
user-pm2 restart food-web

echo ""
echo "=== Deploy complete ==="
# ⚠ `user-pm2 logs` tails an accumulated FILE that persists across every restart
# in a process's history, so old crash output stays mixed in with a healthy
# run's fresh output. The reliable "is it healthy right now" signal is this
# list's uptime/restart-count columns, checked at two points a few minutes
# apart (APOYO_ECOSYSTEM.md — this has bitten two separate deploys already).
user-pm2 list
