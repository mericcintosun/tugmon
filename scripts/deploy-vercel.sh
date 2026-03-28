#!/usr/bin/env bash
# Production deploy to Vercel project `tugmon` (app root: ./web)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"

if [[ ! -f .vercel/project.json ]]; then
  echo "Linking to mericcintosun/tugmon …"
  npx vercel link --yes --project tugmon
fi

echo "Deploying production …"
npx vercel --prod --yes

echo "Done. Production URL is typically https://tugmon.vercel.app (see Vercel dashboard for domains)."
