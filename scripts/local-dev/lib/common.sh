#!/usr/bin/env bash
#
# Common utilities shared across local development scripts.
#
# Functions:
#   timestamp()       - Current time in HH:MM:SS format
#   log_info()        - Log info message
#   log_warn()        - Log warning message
#   log_error()       - Log error message

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
