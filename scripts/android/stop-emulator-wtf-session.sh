#!/usr/bin/env bash
#
# Stop an emulator.wtf session and print session log
#
# Usage: ./stop-emulator-wtf-session.sh [OPTIONS]
#
# Options:
#   --session-pid PID   PID of the session process to stop
#   --session-log FILE  Path to session log file to display
#   --log-lines N       Number of log lines to display (default: 200)
#   --dry-run           Print what would be done without executing
#   --help              Show this help message
#
# Environment:
#   EMULATOR_WTF_SESSION_PID  Session PID (alternative to --session-pid)
#   EMULATOR_WTF_SESSION_LOG  Session log path (alternative to --session-log)
#

set -euo pipefail

# Defaults
SESSION_PID="${EMULATOR_WTF_SESSION_PID:-}"
SESSION_LOG="${EMULATOR_WTF_SESSION_LOG:-}"
LOG_LINES=200
DRY_RUN=false

usage() {
  head -n 18 "$0" | tail -n 16 | sed 's/^# //' | sed 's/^#//'
}

log() {
  echo "[stop-emulator-wtf-session] $*"
}

error() {
  echo "[stop-emulator-wtf-session] ERROR: $*" >&2
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --session-pid)
      SESSION_PID="$2"
      shift 2
      ;;
    --session-log)
      SESSION_LOG="$2"
      shift 2
      ;;
    --log-lines)
      LOG_LINES="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$DRY_RUN" == "true" ]]; then
  if [[ -n "$SESSION_PID" ]]; then
    log "[DRY-RUN] Would kill process: ${SESSION_PID}"
    log "[DRY-RUN] Would wait for process: ${SESSION_PID}"
  else
    log "[DRY-RUN] No session PID provided, would skip process termination"
  fi
  if [[ -n "$SESSION_LOG" ]]; then
    log "[DRY-RUN] Would display last ${LOG_LINES} lines of: ${SESSION_LOG}"
  else
    log "[DRY-RUN] No session log provided, would skip log display"
  fi
  exit 0
fi

# Stop the session process
if [[ -n "$SESSION_PID" ]]; then
  log "Stopping session process: ${SESSION_PID}"
  kill "$SESSION_PID" 2>/dev/null || log "Process already terminated"
  wait "$SESSION_PID" 2>/dev/null || log "Process already reaped"
else
  log "No session PID provided, skipping process termination"
fi

# Display session log
if [[ -n "$SESSION_LOG" ]]; then
  if [[ -f "$SESSION_LOG" ]]; then
    log "Session log (last ${LOG_LINES} lines):"
    tail -n "$LOG_LINES" "$SESSION_LOG" || true
  else
    log "Session log not found: ${SESSION_LOG}"
  fi
else
  log "No session log provided, skipping log display"
fi
