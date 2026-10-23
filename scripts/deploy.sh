#!/usr/bin/env bash
# Safe deploy: checks → backup → migrate → deploy → health check.
#
#   npm run deploy:staging       test site
#   npm run deploy:production    live site (asks you to type DEPLOY LIVE)
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
# (in a Claude cloud session the proxy supplies the token; never commit it).
set -euo pipefail

ENV="${1:-}"
case "$ENV" in
  staging)    URL="https://bodyregen-staging.michaeljmarden.workers.dev"; BUCKET="bodyregen-backups-staging" ;;
  production) URL="${PRODUCTION_URL:-}"; BUCKET="bodyregen-backups" ;;
  *) echo "Usage: scripts/deploy.sh staging|production"; exit 1 ;;
esac

cd "$(dirname "$0")/.."
export CI=true # stops wrangler asking interactive questions; we confirm ourselves below
WR="npx wrangler"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "1/6 Safety checks"
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ You have uncommitted changes. Commit them first so every deploy matches a saved version."; exit 1
fi
if [ "$ENV" = production ]; then
  [ -n "$URL" ] || { echo "✗ Set PRODUCTION_URL (e.g. https://yourdomain.com)."; exit 1; }
  grep -q '"production"' wrangler.jsonc || { echo "✗ No production environment in wrangler.jsonc yet (added at go-live)."; exit 1; }
fi
COMMIT="$(git rev-parse --short HEAD)"
echo "Deploying commit $COMMIT to $ENV"

step "2/6 Type check, migration check and tests"
npm run check

if [ "$ENV" = production ]; then
  printf '\n⚠  This updates the LIVE site. Type DEPLOY LIVE to continue: '
  read -r answer
  [ "$answer" = "DEPLOY LIVE" ] || { echo "Cancelled."; exit 1; }
fi

step "3/6 Backup of the $ENV database"
HAS_TABLES="$($WR d1 execute DB --remote --env "$ENV" --json \
  --command "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='d1_migrations'" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')"
if [ "$HAS_TABLES" = "0" ]; then
  echo "Database is empty (first deploy) — nothing to back up."
else
  STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  FILE="$(mktemp -d)/predeploy-$STAMP-$COMMIT.sql"
  $WR d1 export DB --remote --env "$ENV" --output "$FILE"
  $WR r2 object put "$BUCKET/predeploy/$STAMP-$COMMIT.sql" --file "$FILE" --remote
  echo "✓ Backup saved to R2: $BUCKET/predeploy/$STAMP-$COMMIT.sql ($(wc -c < "$FILE") bytes)"
fi

step "4/6 Database migrations"
$WR d1 migrations apply DB --remote --env "$ENV"

step "5/6 Deploy code"
$WR deploy --env "$ENV" --tag "$COMMIT" --message "Deploy $COMMIT"

step "6/6 Health check"
for i in 1 2 3 4 5; do
  if curl -fsS "$URL/health" | grep -q '"ok":true'; then echo "✓ $URL is up and its database answers."; exit 0; fi
  sleep $((i * 2))
done
echo "✗ Health check failed at $URL/health — investigate now (wrangler rollback --env $ENV undoes the code)."
exit 1
