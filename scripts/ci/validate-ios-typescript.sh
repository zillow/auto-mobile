#!/bin/bash

# CI validation script for iOS TypeScript components
# Validates that TypeScript code for iOS integration builds successfully

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================="
echo "iOS TypeScript Component Validation (CI)"
echo "========================================="
echo ""

# Check for bun
if ! command -v bun &>/dev/null; then
  echo "❌ Error: bun not found"
  echo "   Please install bun: https://bun.sh"
  exit 1
fi

echo "✓ Bun version: $(bun --version)"
echo ""

# Validate Simctl Integration
SIMCTL_PATH="${PROJECT_ROOT}/ios/SimctlIntegration"

if [[ ! -d "${SIMCTL_PATH}" ]]; then
  echo "⚠️  Warning: SimctlIntegration not found, skipping"
  exit 0
fi

echo "Validating ios/SimctlIntegration..."
echo "---"

# Install dependencies
echo "Installing dependencies..."
(cd "${SIMCTL_PATH}" && bun install)

# Build TypeScript
echo "Building TypeScript..."
if (cd "${SIMCTL_PATH}" && bun run build); then
  echo "✓ SimctlIntegration build successful"
else
  echo "❌ SimctlIntegration build failed"
  exit 1
fi

echo ""

# Run tests (if not on macOS, skip tests that require simctl)
if [[ "$(uname)" == "Darwin" ]]; then
  echo "Running tests..."
  if (cd "${SIMCTL_PATH}" && bun test); then
    echo "✓ SimctlIntegration tests passed"
  else
    echo "❌ SimctlIntegration tests failed"
    exit 1
  fi
else
  echo "⚠️  Skipping tests (requires macOS)"
fi

echo ""
echo "========================================="
echo "✓ iOS TypeScript components validated successfully"
echo "========================================="
exit 0
