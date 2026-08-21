#!/usr/bin/env bash
# Cut a release: bump root version, sync packages, commit, tag, push.
# Usage: ./scripts/release.sh <new-version>   e.g. ./scripts/release.sh 0.2.0
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>" >&2
  exit 1
fi

NEW_VERSION="$1"
ROOT_PKG="package.json"

# Validate semver-ish input (digits and dots).
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "Error: '$NEW_VERSION' is not a valid semver version." >&2
  exit 1
fi

# Must run from a clean main branch.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on 'main' branch (current: $BRANCH)." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

# Update the single source of truth.
node -e "const f='$ROOT_PKG';const p=require('./'+f);p.version='$NEW_VERSION';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n');"
node scripts/sync-version.mjs

# Neither sync-version nor the version bump changes the lockfile, but stay safe.
pnpm install --frozen-lockfile

git add -A
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"

echo "Released v$NEW_VERSION — CI will publish to npm."
