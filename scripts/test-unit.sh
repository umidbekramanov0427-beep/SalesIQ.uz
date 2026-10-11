#!/usr/bin/env bash
# Unit tests (tests/unit) with vitest. vitest is fetched by npx instead of
# being a dependency, so package-lock.json / bun.lock (which Vercel installs
# from) stay untouched. npx runs from a temp dir so it installs vitest and a
# matching vite side by side; --root points it back at this repo.
#   npm test                 # everything
#   npm test -- plan-gating  # files matching a name
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VITE_VERSION="$(node -p "require('$ROOT/node_modules/vite/package.json').version")"
cd "$(mktemp -d)"
export npm_config_legacy_peer_deps=true
exec npx --yes -p vitest@5.0.2 -p "vite@$VITE_VERSION" vitest run --root "$ROOT" "$@"
