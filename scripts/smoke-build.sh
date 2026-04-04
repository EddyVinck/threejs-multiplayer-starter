#!/usr/bin/env bash
# Full workspace build plus sanity checks that expected outputs exist.
# Catches "green" builds that omit artifacts or write to unexpected paths.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

pnpm build

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "smoke-build: missing expected file: $path" >&2
    exit 1
  fi
}

require_file "$root/packages/shared/dist/index.js"
require_file "$root/packages/server/dist/index.js"
require_file "$root/packages/client/dist/index.html"
# Vite emits hashed bundles under assets/; ensure at least one JS bundle landed.
shopt -s nullglob
bundles=("$root/packages/client/dist/assets"/*.js)
shopt -u nullglob
if ((${#bundles[@]} == 0)); then
  echo "smoke-build: expected at least one *.js under packages/client/dist/assets/" >&2
  exit 1
fi

node "$root/scripts/validate-jam-constraints.mjs"

echo "smoke-build: OK (build + artifact checks + jam constraints passed)"
