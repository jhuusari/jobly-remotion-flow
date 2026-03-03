#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# On the server, load secrets from /etc/jobly.env when present.
if [ -f /etc/jobly.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/jobly.env
  set +a
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Missing OPENAI_API_KEY"
  exit 1
fi

npm run dev -- --since-days 1 --concurrency 2

# Keep editor-derived feed in sync after pipeline runs.
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^jobly-editor.service'; then
  systemctl restart jobly-editor
fi
