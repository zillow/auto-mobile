#!/usr/bin/env bash
#
# validate_dependabot.sh
#
# Validate that the Dependabot config parses as YAML.
#
# Usage:
#   ./scripts/validate_dependabot.sh [path]
#
# Exit codes:
#   0 - YAML parsed successfully
#   1 - Missing file, missing dependency, or parse error
#
set -euo pipefail

DEPENDABOT_PATH="${1:-.github/dependabot.yml}"

if ! command -v ruby >/dev/null 2>&1; then
  echo "[ERROR] ruby is required to validate YAML." >&2
  exit 1
fi

if [[ ! -f "$DEPENDABOT_PATH" ]]; then
  echo "[ERROR] Dependabot config not found at: $DEPENDABOT_PATH" >&2
  exit 1
fi

ruby - "$DEPENDABOT_PATH" <<'RUBY'
path = ARGV[0]
require "yaml"

begin
  YAML.load_file(path)
rescue StandardError => e
  warn "[ERROR] Failed to parse #{path}: #{e.class}: #{e.message}"
  exit 1
end
RUBY

echo "[INFO] Dependabot config is valid YAML: $DEPENDABOT_PATH"
