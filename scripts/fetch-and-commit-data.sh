#!/usr/bin/env bash
# Fetches the Maritime Boundaries Geodatabase layers from marineregions.org
# and commits the resulting GeoJSON to sources/ in this repo.
#
# Usage:
#   scripts/fetch-and-commit-data.sh          # fetch + commit locally
#   scripts/fetch-and-commit-data.sh --push   # fetch + commit + push to origin
#
# This is the only step in the project that needs live internet access to
# marineregions.org. Everything else (npm run ingest, the plugin at
# runtime) reads from the committed sources/ directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash your changes first:"
  git status --short
  exit 1
fi

echo "==> Installing dependencies"
npm install --no-fund --no-audit

echo "==> Fetching data from marineregions.org"
node lib/fetch-raw.js

if [[ -z "$(git status --porcelain -- sources/)" ]]; then
  echo "==> No changes in sources/ -- nothing to commit"
  exit 0
fi

echo "==> Changes detected in sources/:"
git status --short -- sources/

FEATURE_COUNT_SUMMARY=$(node -e "
  const m = require('./sources/manifest.json');
  console.log(m.layers.map(l => l.layerKey + ': ' + l.featureCount).join(', '));
")

git add sources/
git commit -m "Update marineregions source data

$(date -u +%Y-%m-%dT%H:%M:%SZ)
$FEATURE_COUNT_SUMMARY"

echo "==> Committed."

if [[ "${1:-}" == "--push" ]]; then
  echo "==> Pushing to origin"
  git push
else
  echo "==> Not pushing (pass --push to also push to origin)"
fi
