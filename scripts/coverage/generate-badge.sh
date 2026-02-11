#!/usr/bin/env bash
# Generate a shields.io-compatible JSON badge from lcov coverage data.
# Usage: bash scripts/coverage/generate-badge.sh
set -euo pipefail

LCOV_FILE="coverage/lcov.info"
OUTPUT_FILE="coverage/coverage-badge.json"

if [[ ! -f "$LCOV_FILE" ]]; then
  echo "Error: $LCOV_FILE not found. Run 'bun run test:coverage' first." >&2
  exit 1
fi

lines_found=0
lines_hit=0

while IFS= read -r line; do
  case "$line" in
    LF:*) lines_found=$((lines_found + ${line#LF:})) ;;
    LH:*) lines_hit=$((lines_hit + ${line#LH:})) ;;
  esac
done < "$LCOV_FILE"

if [[ "$lines_found" -eq 0 ]]; then
  echo "Error: no line data found in $LCOV_FILE" >&2
  exit 1
fi

# Compute percentage (integer)
pct=$(( (lines_hit * 100) / lines_found ))

# Determine badge color
if [[ "$pct" -ge 80 ]]; then
  color="brightgreen"
elif [[ "$pct" -ge 60 ]]; then
  color="yellow"
else
  color="red"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"

cat > "$OUTPUT_FILE" <<EOF
{
  "schemaVersion": 1,
  "label": "coverage",
  "message": "${pct}%",
  "color": "${color}"
}
EOF

echo "Badge written to $OUTPUT_FILE: ${pct}% (${color})"
