#!/usr/bin/env bash
# Railway entrypoint for the QED settlement keeper.
# Secrets are injected as env vars and materialized into the file layout the
# keeper expects (repo-root .keys/deployer.json and .txline-auth.json).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${DEPLOYER_KEYPAIR_JSON:-}" ]]; then
  mkdir -p .keys
  printf '%s' "$DEPLOYER_KEYPAIR_JSON" > .keys/deployer.json
fi
if [[ -n "${TXLINE_AUTH_JSON:-}" ]]; then
  printf '%s' "$TXLINE_AUTH_JSON" > .txline-auth.json
fi

cd keeper
# restart-on-crash loop so a transient RPC error never kills the keeper
while true; do
  npm run watch || echo "watcher crashed ($?) — restarting in 15s"
  sleep 15
done
