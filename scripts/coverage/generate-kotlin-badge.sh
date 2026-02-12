#!/usr/bin/env bash
# Generate a shields.io-compatible JSON badge from JaCoCo XML coverage reports.
# Searches for JaCoCo reports from both JVM and Android modules under android/.
# Usage: bash scripts/coverage/generate-kotlin-badge.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ANDROID_DIR="${PROJECT_ROOT}/android"
OUTPUT_FILE="${PROJECT_ROOT}/coverage/kotlin-coverage-badge.json"

total_missed=0
total_covered=0
reports_found=0

# JVM modules: build/reports/jacoco/test/jacocoTestReport.xml
while IFS= read -r -d '' report; do
  line_counter=$(sed -n 's/.*<counter type="LINE" missed="\([0-9]*\)" covered="\([0-9]*\)".*/\1 \2/p' "$report" | tail -1)
  if [[ -n "$line_counter" ]]; then
    missed=$(echo "$line_counter" | awk '{print $1}')
    covered=$(echo "$line_counter" | awk '{print $2}')
    total_missed=$((total_missed + missed))
    total_covered=$((total_covered + covered))
    reports_found=$((reports_found + 1))
    echo "Found JVM report: $report (missed=$missed, covered=$covered)"
  fi
done < <(find "$ANDROID_DIR" -path "*/build/reports/jacoco/test/jacocoTestReport.xml" -print0 2>/dev/null)

# Android modules: build/reports/coverage/test/debug/report.xml
while IFS= read -r -d '' report; do
  line_counter=$(sed -n 's/.*<counter type="LINE" missed="\([0-9]*\)" covered="\([0-9]*\)".*/\1 \2/p' "$report" | tail -1)
  if [[ -n "$line_counter" ]]; then
    missed=$(echo "$line_counter" | awk '{print $1}')
    covered=$(echo "$line_counter" | awk '{print $2}')
    total_missed=$((total_missed + missed))
    total_covered=$((total_covered + covered))
    reports_found=$((reports_found + 1))
    echo "Found Android report: $report (missed=$missed, covered=$covered)"
  fi
done < <(find "$ANDROID_DIR" -path "*/build/reports/coverage/test/debug/report.xml" -print0 2>/dev/null)

if [[ "$reports_found" -eq 0 ]]; then
  echo "Error: no JaCoCo XML reports found under $ANDROID_DIR" >&2
  exit 1
fi

total=$((total_missed + total_covered))
if [[ "$total" -eq 0 ]]; then
  echo "Error: no line data found in JaCoCo reports" >&2
  exit 1
fi

pct=$(( (total_covered * 100) / total ))

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
  "label": "Kotlin coverage",
  "message": "${pct}%",
  "color": "${color}",
  "labelColor": "7F52FF"
}
EOF

echo "Kotlin badge written to $OUTPUT_FILE: ${pct}% (${color}) from $reports_found report(s)"
