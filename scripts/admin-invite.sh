#!/usr/bin/env bash
# Make someone an admin and print a one-time setup link (valid 24 hours).
#
#   bash scripts/admin-invite.sh staging owner@example.com
#
# The person opens the link, chooses a password, then sets up two-step login
# (authenticator app) on their first admin login. Any existing logins are ended.
set -euo pipefail
ENV="${1:-}"; EMAIL="$(echo "${2:-}" | tr '[:upper:]' '[:lower:]')"
case "$ENV" in
  staging) URL="https://bodyregen-staging.michaeljmarden.workers.dev" ;;
  production) URL="${PRODUCTION_URL:?Set PRODUCTION_URL}" ;;
  *) echo "Usage: scripts/admin-invite.sh staging|production email"; exit 1 ;;
esac
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "Give a valid email address."; exit 1; }
cd "$(dirname "$0")/.."
TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
HASH="$(node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "$TOKEN")"
EXPIRES="$(node -e 'console.log(new Date(Date.now()+86400000).toISOString())')"
SQL="INSERT INTO users (email, role) VALUES ('$EMAIL', 'admin') ON CONFLICT (email) DO UPDATE SET role = 'admin', updated_at = datetime('now');
UPDATE sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = '$EMAIL');
INSERT INTO email_tokens (purpose, email, token_hash, expires_at) VALUES ('setup', '$EMAIL', '$HASH', '$EXPIRES');
INSERT INTO audit_log (action, target_type, target_id, detail_json) VALUES ('admin.invite', 'user', '$EMAIL', '{\"via\":\"script\"}');"
CI=true npx wrangler d1 execute DB --remote --env "$ENV" --command "$SQL" >/dev/null
echo "Admin invite for $EMAIL (works once, for 24 hours):"
echo "$URL/account/setup?token=$TOKEN"
