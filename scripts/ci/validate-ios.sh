#!/bin/bash

# Master CI validation script for all iOS components
# Runs both Swift and TypeScript validations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "iOS Components Validation (CI)"
echo "========================================="
echo ""

FAILED=0

# Run Swift validation
echo "Running Swift component validation..."
if "${SCRIPT_DIR}/validate-ios-swift.sh"; then
  echo "✓ Swift validation passed"
else
  echo "❌ Swift validation failed"
  FAILED=1
fi

echo ""
echo "---"
echo ""

# Run TypeScript validation
echo "Running TypeScript component validation..."
if "${SCRIPT_DIR}/validate-ios-typescript.sh"; then
  echo "✓ TypeScript validation passed"
else
  echo "❌ TypeScript validation failed"
  FAILED=1
fi

echo ""
echo "========================================="

if [[ ${FAILED} -eq 0 ]]; then
  echo "✓ All iOS validations passed"
  exit 0
else
  echo "❌ Some iOS validations failed"
  exit 1
fi
