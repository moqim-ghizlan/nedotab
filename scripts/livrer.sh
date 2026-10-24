#!/usr/bin/env bash
# Delivery ritual: checks, commit, annotated tag, push. Usage: scripts/livrer.sh "<message>"
set -euo pipefail
version=$(node -p "require('./package.json').version")
npx prettier --write . >/dev/null
npm test >/dev/null
npm run lint >/dev/null
npm run build:extension >/dev/null
npm run verifier >/dev/null
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag -a "v$version" -m "NedoTab $version"
git push -q origin dev
git push -q origin "v$version"
git log --oneline -1
