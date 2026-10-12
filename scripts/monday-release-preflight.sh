#!/usr/bin/env bash
# Momentum Monday release-readiness audit. Read-only against production.
# Usage: bash scripts/monday-release-preflight.sh
set -Eeuo pipefail

if [[ ! -f package.json || ! -f docs/PRODUCTION_RELEASE_RULE.md ]]; then
  echo "Run this from the Momentum repository root." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "STOP: working tree has uncommitted changes. Do not risk overwriting them." >&2
  git status --short
  exit 3
fi

stamp="$(date +%Y%m%d-%H%M%S)"
log="/tmp/momentum-monday-audit-${stamp}.log"
exec > >(tee "$log") 2>&1

echo "=== Momentum full local audit ==="
echo "Time: $(date -Is)"
echo "Commit: $(git rev-parse HEAD)"
echo "Branch: $(git branch --show-current)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Java: $(java -version 2>&1 | head -n 1)"
echo "Log: $log"
echo "Production deploys are deliberately DISABLED by this script."

on_failure() {
  result=$?
  echo
  echo "AUDIT FAILED (exit ${result}). Read the log above and at: $log"
  echo "Do NOT deploy, merge, or approve money/permission changes based on this run."
  exit "$result"
}
trap on_failure ERR

echo "1/11 clean diff"; git diff --check
echo "2/11 app dependency lockfile install"; npm ci
echo "3/11 Firebase Functions dependency lockfile install"; npm --prefix functions ci
echo "4/11 application typecheck"; npm run typecheck
echo "5/11 application lint"; npm run lint
echo "6/11 complete enumerated logic regression suite"; npm run test:logic
echo "7/11 Firestore rules/emulator security tests"; npm run test:rules
echo "8/11 generated rules unchanged"; git diff --exit-code -- firestore.rules
echo "9/11 Firebase Functions compile"; npm --prefix functions run build
echo "10/11 Firebase Functions lint"; npm --prefix functions run lint
echo "11/11 browser production build"; npm run build

echo "=== Final integrity check ==="
git diff --check
git diff --exit-code
if [[ -n "$(git status --porcelain)" ]]; then
  echo "AUDIT BLOCKED: tracked/untracked source changed after tests."
  git status --short
  exit 4
fi

echo "AUTOMATED AUDIT PASSED for $(git rev-parse --short HEAD)"
echo "Log: $log"
echo "NOT A RELEASE APPROVAL. Still required:"
echo "- compare live authenticated Admin / Sales Manager / Rep / Operations / Driver / Customer"
echo "- verify Firestore denial of unauthorized CRM account edits"
echo "- verify invoice Ledger + Detail + browser print/PDF visually"
echo "- collect real 5+ simultaneous-user before/after navigation/Firestore timings"
echo "- verify commission collection exclusions, historical attribution and prior payouts"
echo "- resolve Cloudflare failed build and explicit Flo release-owner approval"
