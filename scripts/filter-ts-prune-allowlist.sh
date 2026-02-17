#!/usr/bin/env bash
# Filters ts-prune output (from stdin) against dead-code-allowlist.json ignorePaths.
# Lines matching any allowlisted file path are excluded from the output.

set -euo pipefail

ALLOWLIST="dead-code-allowlist.json"

if [ ! -f "$ALLOWLIST" ]; then
  cat # No allowlist found, pass through
  exit 0
fi

if ! command -v jq &> /dev/null; then
  echo "Warning: jq not installed, skipping allowlist filtering" >&2
  cat
  exit 0
fi

# Build grep exclusion pattern from all ignorePaths
PATTERN=$(jq -r '.ignorePaths[]' "$ALLOWLIST" \
  | sed "s/[.[\\*^\$()+?{|]/\\\\&/g" \
  | paste -sd '|' -)

if [ -z "$PATTERN" ]; then
  cat # No patterns, pass through
else
  grep -vE "$PATTERN" || true
fi
