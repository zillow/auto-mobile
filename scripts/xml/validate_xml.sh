#!/usr/bin/env bash

# Cross-platform XML validation using xmlstarlet or xml command
validate_xml() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    xml "$@"
  else
    xmlstarlet "$@"
  fi
}

# Check for required XML tools
if [[ $(! command -v xml &>/dev/null) && $(! command -v xmlstarlet &>/dev/null) ]]; then
  echo "xmlstarlet missing, please install."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Try 'brew install xmlstarlet'"
  else
    echo "Consult your OS package manager"
  fi
  exit 1
fi

# Start the timer
start_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")

# Need to export this function for xargs bash to see it
export -f validate_xml

# Find XML files, excluding files ignored by .gitignore
# shellcheck disable=SC2016
errors=$(git ls-files --cached --others --exclude-standard -z |
  grep -z '\.xml$' |
  xargs -0 -n 1 -P "$(nproc)" bash -c 'validate_xml val -w -b -e "$0"' 2>&1)

# Calculate total elapsed time
end_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")
total_elapsed=$((end_time - start_time))

# Check and report errors
if [[ -n $errors ]]; then
  echo "Errors in the following files:"
  echo "$errors"
  echo "Total time elapsed in $total_elapsed ms."
  exit 1
else
  echo "No XML errors found in $total_elapsed ms."
fi
