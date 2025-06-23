#!/usr/bin/env bash

# Check if shellcheck is installed
if ! command -v shellcheck &>/dev/null; then
    echo "shellcheck missing"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "Try 'brew install shellcheck'"
    else
      echo "Consult your OS package manager"
    fi
    exit 1
fi

# Start the timer
start_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")

# Find shell scripts and validate in parallel
# shellcheck disable=SC2016
errors=$(git ls-files --cached --others --exclude-standard -z |
  grep -z '\.sh$' |
  xargs -0 -n 1 -P "$(nproc)" bash -c 'shellcheck "$0"' 2>&1)

# Calculate total elapsed time
end_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")
total_elapsed=$((end_time - start_time))

# Check and report errors
if [[ -n $errors ]]; then
    echo "Errors in the following files:"
    echo "$errors"
    echo "Total time elapsed: $total_elapsed ms."
    exit 1
fi

echo "All shell scripts are valid."
