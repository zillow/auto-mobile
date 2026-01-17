#!/usr/bin/env bash
#
# Common utilities shared across local development scripts.
#
# Functions:
#   timestamp()       - Current time in HH:MM:SS format
#   log_info()        - Log info message
#   log_warn()        - Log warning message
#   log_error()       - Log error message
#   detect_port()     - Auto-detect dev server port from branch name

# Logging functions
timestamp() {
  date +"%H:%M:%S"
}

log_info() {
  echo "[$(timestamp)] [INFO] $*"
}

log_warn() {
  echo "[$(timestamp)] [WARN] $*"
}

log_error() {
  echo "[$(timestamp)] [ERROR] $*"
}

# Detect port from environment or branch name
# Usage: PORT=$(detect_port "$PROJECT_ROOT")
detect_port() {
  local project_root="${1:-.}"
  local base_port=9000
  local env_port="${AUTOMOBILE_PORT:-${AUTO_MOBILE_PORT:-}}"
  if [[ -n "${env_port}" ]]; then
    echo "${env_port}"
    return
  fi

  local branch
  branch=$(git -C "${project_root}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [[ -n "${branch}" && "${branch}" =~ ([0-9]{1,4}) ]]; then
    local issue_number="${BASH_REMATCH[1]}"
    if [[ "${issue_number}" -gt 0 && "${issue_number}" -lt 1000 ]]; then
      echo $((base_port + issue_number))
      return
    fi
  fi

  echo "${base_port}"
}
