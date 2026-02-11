#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readme_path="${repo_root}/README.md"

# --- Count tests ---

ts_count=$(grep -rE '^\s*(it|test)\(' "${repo_root}/test/" --include='*.test.ts' \
  | grep -vc '\.skip(')

kotlin_count=$(grep -rE '^\s*@Test' "${repo_root}/android/" --include='*.kt' \
  | grep -cE 'src/(test|androidTest)/')

swift_count=$(grep -rcE '^\s*func test' "${repo_root}/ios/" --include='*.swift' \
  | awk -F: '{s+=$NF} END {print s+0}')

# --- Format numbers with commas ---

format_number() {
  local n="$1"
  local formatted=""
  local i=0
  while [ "$n" -gt 0 ]; do
    digit=$((n % 10))
    n=$((n / 10))
    if [ "$i" -gt 0 ] && [ $((i % 3)) -eq 0 ]; then
      formatted=",${formatted}"
    fi
    formatted="${digit}${formatted}"
    i=$((i + 1))
  done
  [ -z "$formatted" ] && formatted="0"
  echo "$formatted"
}

ts_formatted=$(format_number "$ts_count")
kotlin_formatted=$(format_number "$kotlin_count")
swift_formatted=$(format_number "$swift_count")

# URL-encode commas for shields.io badge URLs
ts_url="${ts_formatted//,/%2C}"
kotlin_url="${kotlin_formatted//,/%2C}"
swift_url="${swift_formatted//,/%2C}"

echo "Test counts: TypeScript=${ts_formatted} Kotlin=${kotlin_formatted} Swift=${swift_formatted}"

# --- Validate badge lines exist ---

for label in "TypeScript_tests" "Kotlin_tests" "Swift_tests"; do
  if ! grep -q "img.shields.io/badge/${label}-" "$readme_path"; then
    echo "ERROR: Badge line for ${label} not found in ${readme_path}" >&2
    exit 1
  fi
done

# --- Update badge lines via sed on temp file ---

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

cp "$readme_path" "$tmp_file"

sed -E -i "" \
  -e "s|img.shields.io/badge/TypeScript_tests-[^)]*-3178C6\)|img.shields.io/badge/TypeScript_tests-${ts_url}-3178C6)|" \
  -e "s|img.shields.io/badge/Kotlin_tests-[^)]*-7F52FF\)|img.shields.io/badge/Kotlin_tests-${kotlin_url}-7F52FF)|" \
  -e "s|img.shields.io/badge/Swift_tests-[^)]*-F05138\)|img.shields.io/badge/Swift_tests-${swift_url}-F05138)|" \
  -e "s|\!\[TypeScript tests: [0-9,]*\]|![TypeScript tests: ${ts_formatted}]|" \
  -e "s|\!\[Kotlin tests: [0-9,]*\]|![Kotlin tests: ${kotlin_formatted}]|" \
  -e "s|\!\[Swift tests: [0-9,]*\]|![Swift tests: ${swift_formatted}]|" \
  "$tmp_file" 2>/dev/null \
|| sed -E -i \
  -e "s|img.shields.io/badge/TypeScript_tests-[^)]*-3178C6\)|img.shields.io/badge/TypeScript_tests-${ts_url}-3178C6)|" \
  -e "s|img.shields.io/badge/Kotlin_tests-[^)]*-7F52FF\)|img.shields.io/badge/Kotlin_tests-${kotlin_url}-7F52FF)|" \
  -e "s|img.shields.io/badge/Swift_tests-[^)]*-F05138\)|img.shields.io/badge/Swift_tests-${swift_url}-F05138)|" \
  -e "s|\!\[TypeScript tests: [0-9,]*\]|![TypeScript tests: ${ts_formatted}]|" \
  -e "s|\!\[Kotlin tests: [0-9,]*\]|![Kotlin tests: ${kotlin_formatted}]|" \
  -e "s|\!\[Swift tests: [0-9,]*\]|![Swift tests: ${swift_formatted}]|" \
  "$tmp_file"

# --- Write only if changed ---

if cmp -s "$readme_path" "$tmp_file"; then
  echo "INFO: README badges already up to date"
  exit 0
fi

mv "$tmp_file" "$readme_path"
trap - EXIT

echo "Updated README badges:"
echo "   TypeScript tests: ${ts_formatted}"
echo "   Kotlin tests: ${kotlin_formatted}"
echo "   Swift tests: ${swift_formatted}"
echo "   File: ${readme_path}"
