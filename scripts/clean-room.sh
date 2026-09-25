#!/usr/bin/env bash
# scripts/clean-room.sh
# Clone-fresh release guard. Proves the repo builds + passes from a clean checkout,
# leaks no secrets, and regenerates evidence with zero drift.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/5] Secret-leak scan (tracked files only)"
if git grep -nIE '(REPLACE_ME_ACTUAL|BEGIN [A-Z ]*PRIVATE KEY|[1-9A-HJ-NP-Za-km-z]{80,})' \
     -- ':!*.md' ':!package-lock.json' 2>/dev/null; then
  echo "FAIL: possible leaked secret in tracked files"; exit 1
fi
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "FAIL: .env is tracked — secrets must never be committed"; exit 1
fi
echo "    ok — no leaked secrets"

echo "==> [2/5] Install (offline-safe)"
npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1
echo "    ok"

echo "==> [3/5] Typecheck"
npm run typecheck

echo "==> [4/5] Offline test suite (no live network)"
npm test

echo "==> [5/5] Regenerate evidence via verify-claims (drift check)"
if [ -n "${RPC_URL:-}" ]; then
  npm run verify
else
  echo "    skipped — RPC_URL unset (live verification requires mainnet RPC)"
fi

echo "==> clean-room PASSED"
