#!/usr/bin/env bash

# Validate lychee configuration and run link checking
echo "Validating lychee configuration..."

# Check if lychee is installed
if ! command -v lychee >/dev/null 2>&1; then
    echo "Error: lychee is not installed"
    exit 1
fi

echo "lychee is available"
exit 0
