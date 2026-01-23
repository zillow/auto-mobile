#!/usr/bin/env bash
#
# Install emulator.wtf CLI with retry logic
#
# Usage: ./install-ew-cli.sh [OPTIONS]
#
# Options:
#   --install-dir DIR   Directory to install ew-cli (default: $HOME/bin)
#   --max-attempts N    Maximum download attempts (default: 5)
#   --retry-delay N     Seconds between retries (default: 1)
#   --dry-run           Print what would be done without executing
#   --help              Show this help message
#

set -euo pipefail

# Defaults
INSTALL_DIR="${HOME}/bin"
MAX_ATTEMPTS=5
RETRY_DELAY=1
DRY_RUN=false
EW_CLI_URL="https://maven.emulator.wtf/releases/ew-cli"

usage() {
  head -n 15 "$0" | tail -n 13 | sed 's/^# //' | sed 's/^#//'
}

log() {
  echo "[install-ew-cli] $*"
}

error() {
  echo "[install-ew-cli] ERROR: $*" >&2
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --max-attempts)
      MAX_ATTEMPTS="$2"
      shift 2
      ;;
    --retry-delay)
      RETRY_DELAY="$2"
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

EW_CLI_PATH="${INSTALL_DIR}/ew-cli"

if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would create directory: ${INSTALL_DIR}"
  log "[DRY-RUN] Would download ew-cli from: ${EW_CLI_URL}"
  log "[DRY-RUN] Would save to: ${EW_CLI_PATH}"
  log "[DRY-RUN] Would make executable: ${EW_CLI_PATH}"
  log "[DRY-RUN] Max attempts: ${MAX_ATTEMPTS}, retry delay: ${RETRY_DELAY}s"
  exit 0
fi

# Check if already installed
if [[ -x "${EW_CLI_PATH}" ]]; then
  log "ew-cli already installed at ${EW_CLI_PATH}"
  "${EW_CLI_PATH}" --version
  exit 0
fi

log "Creating directory: ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

# Download with retry
attempt=1
while [[ $attempt -le $MAX_ATTEMPTS ]]; do
  log "Downloading ew-cli (attempt ${attempt}/${MAX_ATTEMPTS})..."
  if curl -fsSL "${EW_CLI_URL}" -o "${EW_CLI_PATH}"; then
    log "Download successful"
    break
  fi
  if [[ $attempt -eq $MAX_ATTEMPTS ]]; then
    error "Failed to download ew-cli after ${MAX_ATTEMPTS} attempts"
    exit 1
  fi
  log "Download failed, retrying in ${RETRY_DELAY} second(s)..."
  sleep "${RETRY_DELAY}"
  attempt=$((attempt + 1))
done

log "Making ew-cli executable"
chmod a+x "${EW_CLI_PATH}"

log "Installed successfully:"
"${EW_CLI_PATH}" --version
