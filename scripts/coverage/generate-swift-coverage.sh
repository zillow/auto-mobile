#!/usr/bin/env bash
# Generate a shields.io-compatible JSON badge from Swift package code coverage.
# Builds and tests each testable Swift package with coverage enabled, then
# aggregates line coverage across all packages.
# Usage: bash scripts/coverage/generate-swift-coverage.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"
OUTPUT_FILE="${PROJECT_ROOT}/coverage/swift-coverage-badge.json"

# Core library packages only — excludes scaffold apps (XcodeCompanion, XcodeExtension)
# and iOS-only packages (XCTestRunner) that require a simulator.
TESTABLE_PACKAGES=(
  "control-proxy"
)

total_lines=0
total_covered=0
packages_found=0

for package in "${TESTABLE_PACKAGES[@]}"; do
  package_dir="${IOS_DIR}/${package}"
  if [[ ! -f "${package_dir}/Package.swift" ]]; then
    echo "Skipping ${package} (no Package.swift)"
    continue
  fi

  if ! grep -q "testTarget" "${package_dir}/Package.swift"; then
    echo "Skipping ${package} (no test targets)"
    continue
  fi

  echo "Testing ${package} with coverage..."
  if ! (cd "${package_dir}" && swift test --enable-code-coverage 2>&1); then
    echo "Error: ${package} tests failed" >&2
    exit 1
  fi

  # Find the coverage profile
  build_dir=$(cd "${package_dir}" && swift build --show-bin-path 2>/dev/null)
  profile="${build_dir}/codecov/default.profdata"
  if [[ ! -f "$profile" ]]; then
    echo "Warning: no profdata found for ${package}" >&2
    continue
  fi

  # Find the test binary (the Mach-O executable inside the .xctest bundle)
  # The bundle name is derived from the Swift package's module name, not the directory name,
  # so we search dynamically rather than constructing a fixed name.
  xctest_bundle=$(find "${build_dir}" -maxdepth 1 -name "*PackageTests.xctest" 2>/dev/null | head -1)
  if [[ -z "$xctest_bundle" ]]; then
    echo "Warning: no test binary found for ${package}" >&2
    continue
  fi
  bundle_name=$(basename "${xctest_bundle}" .xctest)
  test_binary="${xctest_bundle}/Contents/MacOS/${bundle_name}"
  if [[ ! -f "$test_binary" ]]; then
    echo "Warning: no test binary found for ${package}" >&2
    continue
  fi

  # Extract line coverage using llvm-cov export (binary must precede -instr-profile)
  coverage_json=$(xcrun llvm-cov export "$test_binary" -instr-profile "$profile" -summary-only 2>/dev/null || true)
  if [[ -z "$coverage_json" ]]; then
    echo "Warning: llvm-cov export failed for ${package}" >&2
    continue
  fi

  # Parse totals using python3 (available on macOS)
  read -r pkg_lines pkg_covered <<< "$(echo "$coverage_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
totals = data['data'][0]['totals']['lines']
print(totals['count'], totals['covered'])
" 2>/dev/null || echo "0 0")"

  if [[ "$pkg_lines" -gt 0 ]]; then
    total_lines=$((total_lines + pkg_lines))
    total_covered=$((total_covered + pkg_covered))
    packages_found=$((packages_found + 1))
    pkg_pct=$(( (pkg_covered * 100) / pkg_lines ))
    echo "${package}: ${pkg_pct}% (${pkg_covered}/${pkg_lines} lines)"
  fi
done

if [[ "$packages_found" -eq 0 ]]; then
  echo "Error: no Swift coverage data collected" >&2
  exit 1
fi

if [[ "$total_lines" -eq 0 ]]; then
  echo "Error: no line data found in Swift coverage" >&2
  exit 1
fi

pct=$(( (total_covered * 100) / total_lines ))

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
  "label": "Swift coverage",
  "message": "${pct}%",
  "color": "${color}",
  "labelColor": "F05138"
}
EOF

echo "Swift badge written to $OUTPUT_FILE: ${pct}% (${color}) from $packages_found package(s)"
