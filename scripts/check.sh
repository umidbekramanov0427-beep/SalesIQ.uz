#!/usr/bin/env bash
# Everything to run before a push: unit tests, TypeScript and the
# production build (which also regenerates src/routeTree.gen.ts).
# With a URL it smoke-tests that running app too:
#   npm run check                      # code only
#   npm run check -- http://127.0.0.1:8080
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== unit tests"; npm test --silent
echo "== typescript"; npx tsc --noEmit
echo "== build"; npm run build --silent > /dev/null
if [ -n "${1:-}" ]; then echo "== smoke"; node scripts/smoke.mjs "$1"; fi
echo "All checks passed."
