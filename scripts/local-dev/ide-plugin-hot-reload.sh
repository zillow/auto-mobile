#!/usr/bin/env bash
#
# AutoMobile IDE plugin hot-reload development workflow.
#
# This script watches for changes in the IDE plugin source, rebuilds,
# reinstalls to the target IDE, and optionally restarts the IDE.
#
# Usage:
#   ./scripts/local-dev/ide-plugin-hot-reload.sh [options]
#
# Options:
#   --ide <name>         Pre-select IDE by name (skip prompt)
#   --once               Build/install once and exit
#   --poll-interval <s>  File watch interval (default: 2)
#   --no-restart         Install without restarting IDE
#   --help               Show help
#
# Examples:
#   ./scripts/local-dev/ide-plugin-hot-reload.sh
#   ./scripts/local-dev/ide-plugin-hot-reload.sh --ide "Android Studio"
#   ./scripts/local-dev/ide-plugin-hot-reload.sh --once
#   ./scripts/local-dev/ide-plugin-hot-reload.sh --no-restart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source library files
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/deps.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/apk.sh"  # For hash_stream, stat_entry
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/ide-plugin.sh"

# CLI options with defaults
IDE_NAME=""
RUN_ONCE=false
POLL_INTERVAL=2
NO_RESTART=false

usage() {
  cat << EOF
Usage: $0 [options]

AutoMobile IDE plugin hot-reload development workflow.

Options:
  --ide <name>         Pre-select IDE by name (skip prompt)
  --once               Build/install once and exit
  --poll-interval <s>  File watch interval (default: 2)
  --no-restart         Install without restarting IDE
  --help               Show this help text

Examples:
  $0
  $0 --ide "Android Studio"
  $0 --once
  $0 --no-restart
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ide)
      if [[ $# -lt 2 ]]; then
        log_error "--ide requires a value."
        usage
        exit 1
      fi
      IDE_NAME="$2"
      shift 2
      ;;
    --once)
      RUN_ONCE=true
      shift
      ;;
    --poll-interval)
      if [[ $# -lt 2 ]]; then
        log_error "--poll-interval requires a value."
        usage
        exit 1
      fi
      POLL_INTERVAL="$2"
      shift 2
      ;;
    --no-restart)
      NO_RESTART=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Check platform
if [[ "$(uname -s)" != "Darwin" ]]; then
  log_error "This script currently only supports macOS."
  log_error "Linux/Windows support can be added if needed."
  exit 1
fi

# Ensure gum is available for interactive prompts
if ! ensure_gum; then
  if [[ -z "${IDE_NAME}" ]]; then
    log_warn "gum not available. Use --ide <name> to specify the IDE."
  fi
fi

# Detect and select IDE
log_info "Detecting installed IDEs..."
if ! select_ide "${IDE_NAME}"; then
  log_error "IDE selection failed."
  exit 1
fi

# Resolve plugins directory
PLUGINS_DIR=$(get_ide_plugins_dir)
if [[ -z "${PLUGINS_DIR}" ]]; then
  log_error "Could not determine plugins directory."
  exit 1
fi

log_info "Plugins directory: ${PLUGINS_DIR}"
log_info "Source: ${IDE_PLUGIN_DIR}/src"

# Initial build
log_info "Performing initial build..."
if ! build_ide_plugin; then
  log_error "Initial build failed. Fix errors and retry."
  exit 1
fi

# Initial install
if ! install_ide_plugin "${PLUGINS_DIR}"; then
  log_error "Initial install failed."
  exit 1
fi

# Handle --once mode: build/install and exit
if [[ "${RUN_ONCE}" == "true" ]]; then
  log_info "Run-once mode complete."
  if [[ "${NO_RESTART}" != "true" ]]; then
    restart_ide
  else
    log_info "Restart your IDE to load the updated plugin."
  fi
  exit 0
fi

# Restart IDE for initial install (unless --no-restart)
if [[ "${NO_RESTART}" != "true" ]]; then
  restart_ide
fi

# Enter watch loop
ide_plugin_watch_loop "${POLL_INTERVAL}" "${PLUGINS_DIR}" "${NO_RESTART}"
