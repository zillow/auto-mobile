#!/usr/bin/env bash
#
# Start an emulator.wtf session and wait for adb device to connect
#
# Usage: ./start-emulator-wtf-session.sh [OPTIONS]
#
# Options:
#   --max-time-limit T  Max emulator session time, e.g. 1m, 2m (default: 1m)
#   --device SPEC       Device profile, e.g. model=Pixel2,version=34,gpu=auto
#   --session-log FILE  Path to session log file (default: /tmp/emulator-wtf-session.log)
#   --timeout N         Seconds to wait for adb device (default: 60)
#   --poll-interval N   Seconds between adb device checks (default: 2)
#   --env-file FILE     File to append environment variables (default: none)
#   --dry-run           Print what would be done without executing
#   --help              Show this help message
#
# Environment:
#   EW_API_TOKEN        Required. emulator.wtf API token
#

set -euo pipefail

# Defaults
MAX_TIME_LIMIT="1m"
DEVICE=""
SESSION_LOG="/tmp/emulator-wtf-session.log"
TIMEOUT=60
POLL_INTERVAL=2
ENV_FILE=""
DRY_RUN=false

usage() {
  head -n 20 "$0" | tail -n 18 | sed 's/^# //' | sed 's/^#//'
}

log() {
  echo "[start-emulator-wtf-session] $*"
}

error() {
  echo "[start-emulator-wtf-session] ERROR: $*" >&2
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --max-time-limit)
      MAX_TIME_LIMIT="$2"
      shift 2
      ;;
    --device)
      DEVICE="$2"
      shift 2
      ;;
    --session-log)
      SESSION_LOG="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
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

# Build device args
device_args=()
if [[ -n "$DEVICE" ]]; then
  device_args+=(--device "$DEVICE")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would check for EW_API_TOKEN environment variable"
  log "[DRY-RUN] Would run: ew-cli start-session --max-time-limit ${MAX_TIME_LIMIT} --adb ${device_args[*]:-}"
  log "[DRY-RUN] Would redirect output to: ${SESSION_LOG}"
  log "[DRY-RUN] Would poll for adb device every ${POLL_INTERVAL}s for up to ${TIMEOUT}s"
  if [[ -n "$ENV_FILE" ]]; then
    log "[DRY-RUN] Would write session PID and log path to: ${ENV_FILE}"
  fi
  exit 0
fi

# Validate required environment
if [[ -z "${EW_API_TOKEN:-}" ]]; then
  error "EW_API_TOKEN is not set"
  exit 1
fi

# Start session in background
log "Starting emulator.wtf session (max-time-limit: ${MAX_TIME_LIMIT})"
ew-cli start-session --max-time-limit "$MAX_TIME_LIMIT" --adb "${device_args[@]}" \
  >"$SESSION_LOG" 2>&1 &
session_pid=$!

log "Session started with PID: ${session_pid}"
log "Session log: ${SESSION_LOG}"

# Write environment variables if requested
if [[ -n "$ENV_FILE" ]]; then
  echo "EMULATOR_WTF_SESSION_PID=$session_pid" >> "$ENV_FILE"
  echo "EMULATOR_WTF_SESSION_LOG=$SESSION_LOG" >> "$ENV_FILE"
  log "Wrote session info to: ${ENV_FILE}"
fi

# Wait for adb device
log "Waiting for adb device to connect (timeout: ${TIMEOUT}s)..."
max_polls=$((TIMEOUT / POLL_INTERVAL))
poll=0
while [[ $poll -lt $max_polls ]]; do
  if adb devices | awk 'NR>1 && $2=="device" {found=1} END {exit found ? 0 : 1}'; then
    log "adb device connected"
    exit 0
  fi
  sleep "$POLL_INTERVAL"
  poll=$((poll + 1))
done

error "Timed out waiting for adb device after ${TIMEOUT}s"
log "Session log contents:"
cat "$SESSION_LOG" || true
exit 1
