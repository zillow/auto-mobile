#!/usr/bin/env bash
#
# AutoMobile Android hot-reload development workflow.
#
# This is the main entry point for Android development. It combines APK building,
# hot-reload watching, MCP server management, and AI coding assistant integration.
#
# Usage:
#   ./scripts/local-dev/android-hot-reload.sh [options]
#
# Options:
#   --device <id>        Target specific ADB device
#   --skip-ai            Skip AI agent prompt (still runs APK watcher + MCP server)
#   --once               Build/install once and exit (no MCP server, no watch loop)
#   --update-checksum    Update release.ts with APK checksum
#   --poll-interval <s>  File watch interval (default: 2)
#   --help               Show help
#
# Default behavior: APK build/watch + MCP server + AI agent prompt
# With --skip-ai: APK build/watch + MCP server (no AI prompt)
# With --once: Build/install once and exit
#
# Environment:
#   ANDROID_SERIAL       ADB device id override
#   AUTOMOBILE_PORT      Override MCP dev server port
#   AUTO_MOBILE_PORT     Deprecated alias for AUTOMOBILE_PORT
#   AI_YOLO_MODE         If set, launch Claude/Codex with auto-accept flags

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source library files
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/deps.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/adb.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/apk.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/ide-plugin.sh"

# Path constants
ANDROID_DIR="${PROJECT_ROOT}/android"
SERVICE_DIR="${ANDROID_DIR}/accessibility-service"
APK_PATH="${SERVICE_DIR}/build/outputs/apk/debug/accessibility-service-debug.apk"
MCP_JSON="${PROJECT_ROOT}/.mcp.json"
CODEX_CONFIG_DIR="${HOME}/.codex"
CODEX_TOML="${CODEX_CONFIG_DIR}/config.toml"
PID_FILE="${PROJECT_ROOT}/.automobile-hot-reload.pid"

# CLI options with defaults
DEVICE_ID=""
SKIP_AI=false
RUN_ONCE=false
UPDATE_CHECKSUM=true  # Always update release.ts checksum during hot-reload
POLL_INTERVAL=2
IDE_NAME=""           # Pre-select IDE by name (skip prompt)
NO_IDE_RESTART=false  # Install plugin without restarting IDE

# Runtime state (PIDs set in start_*_watcher functions)
TS_WATCHER_PID=""
WATCHER_PID=""
IDE_WATCHER_PID=""
IDE_PLUGINS_DIR=""

usage() {
  cat << EOF
Usage: $0 [options]

AutoMobile Android hot-reload development workflow.

Options:
  --device <id>        Target specific ADB device
  --skip-ai            Skip AI agent prompt (still runs watchers)
  --once               Build/install once and exit (no watch loops)
  --update-checksum    Update release.ts with APK checksum (default: on)
  --poll-interval <s>  File watch interval (default: 2)
  --ide <name>         Pre-select IDE by name (e.g., "Android Studio")
  --no-ide-restart     Install IDE plugin without restarting IDE
  --help               Show this help text

Default behavior: APK + IDE plugin + daemon hot-reload + AI agent prompt
With --skip-ai: All hot-reload watchers (no AI prompt)
With --once: Build/install once and exit

Watchers:
  - APK: Rebuilds/installs accessibility service on source changes
  - IDE plugin: Rebuilds/installs and restarts IDE on plugin source changes
  - Daemon: Restarts MCP daemon on TypeScript source changes

Environment variables:
  ANDROID_SERIAL       ADB device id override
  AI_YOLO_MODE         If set, launch Claude/Codex with auto-accept flags
EOF
}

# Kill any previous hot-reload processes
kill_previous() {
  if [[ -f "${PID_FILE}" ]]; then
    local old_pid
    old_pid=$(cat "${PID_FILE}" 2>/dev/null || true)
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      log_info "Killing previous hot-reload process (PID ${old_pid})..."
      kill "${old_pid}" 2>/dev/null || true
      # Give it a moment to clean up
      sleep 1
      # Force kill if still running
      if kill -0 "${old_pid}" 2>/dev/null; then
        kill -9 "${old_pid}" 2>/dev/null || true
      fi
    fi
    rm -f "${PID_FILE}"
  fi

  # Also kill any orphaned processes
  local pids
  pids=$(pgrep -f "android-hot-reload.sh" 2>/dev/null | grep -v "$$" || true)
  if [[ -n "${pids}" ]]; then
    log_info "Killing orphaned hot-reload processes..."
    echo "${pids}" | xargs kill 2>/dev/null || true
  fi
}

# Update .mcp.json for local stdio development
update_mcp_json() {
  log_info "Updating ${MCP_JSON} for local development..."

  cat > "${MCP_JSON}" << EOF
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": [
        "-y",
        "@kaeawc/auto-mobile",
        "--debug",
        "--debug-perf"
      ]
    }
  }
}
EOF
}

# Update ~/.codex/config.toml for local stdio development
update_codex_toml() {
  log_info "Updating ${CODEX_TOML} for local development..."

  # Ensure the config directory exists
  mkdir -p "${CODEX_CONFIG_DIR}"

  cat > "${CODEX_TOML}" << EOF
# Codex configuration for AutoMobile development
# Auto-generated by android-hot-reload.sh

[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile", "--debug", "--debug-perf"]
EOF
}

# Reload MCP daemon by restarting the daemon process
# The daemon is identified by the --daemon-mode flag
reload_mcp_daemon() {
  log_info "Restarting MCP daemon..."
  # Use auto-mobile CLI to restart the daemon gracefully
  if command -v auto-mobile >/dev/null 2>&1; then
    auto-mobile --daemon restart --debug --debug-perf 2>&1 | while read -r line; do
      log_info "[daemon] ${line}"
    done
  else
    # Fallback: kill daemon processes directly
    local pids
    pids=$(pgrep -f "auto-mobile.*--daemon-mode" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      log_info "Killing daemon processes: ${pids}"
      echo "${pids}" | xargs kill 2>/dev/null || true
    fi
  fi
}

# List TypeScript source files to watch
list_ts_files() {
  local src_dir="${PROJECT_ROOT}/src"
  if [[ -d "${src_dir}" ]]; then
    find "${src_dir}" -type f -name "*.ts" 2>/dev/null || true
  fi
}

# Compute hash of TypeScript file timestamps
hash_ts_state() {
  list_ts_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      if [[ "$(uname -s)" == "Darwin" ]]; then
        stat -f "%m %N" "${file}" 2>/dev/null || true
      else
        stat -c "%Y %n" "${file}" 2>/dev/null || true
      fi
    fi
  done | sort | hash_stream
}

# Build TypeScript before daemon restart
build_typescript() {
  log_info "Building TypeScript..."
  if (cd "${PROJECT_ROOT}" && bun run build); then
    log_info "TypeScript build complete."
    return 0
  else
    log_warn "TypeScript build failed."
    return 1
  fi
}

# Watch TypeScript files and reload daemon on changes
watch_ts_loop() {
  local poll_interval="${1:-2}"
  local last_ts_hash
  last_ts_hash="$(hash_ts_state)"

  while true; do
    sleep "${poll_interval}"

    local next_ts_hash
    next_ts_hash="$(hash_ts_state)"
    if [[ "${next_ts_hash}" != "${last_ts_hash}" ]]; then
      log_info "TypeScript change detected. Rebuilding and reloading MCP daemon..."
      if build_typescript; then
        reload_mcp_daemon
      fi
      last_ts_hash="${next_ts_hash}"
    fi
  done
}

# Start APK watcher in background
start_apk_watcher() {
  log_info "Starting APK watcher in background..."
  # Run watch_loop in a subshell in background, redirect output to log file
  (watch_loop "${POLL_INTERVAL}" "${UPDATE_CHECKSUM}") >> "${PROJECT_ROOT}/scratch/hot-reload.log" 2>&1 &
  WATCHER_PID=$!
  echo "${WATCHER_PID}" > "${PID_FILE}"
  log_info "APK watcher started (PID ${WATCHER_PID})"
  log_info "Logs: ${PROJECT_ROOT}/scratch/hot-reload.log"
}

# Prompt user to select an AI coding assistant
prompt_ide() {
  if ! ensure_gum; then
    log_warn "Skipping IDE prompt (gum not available)."
    return
  fi

  # Clear terminal for clean prompt
  clear

  local choice
  choice=$(gum choose --header "Start an AI coding assistant?" "Claude Code" "Codex" "Neither")

  # Disown background watchers before exec so they keep running
  # when the shell process is replaced
  disown_watchers() {
    if [[ -n "${TS_WATCHER_PID}" ]]; then
      disown "${TS_WATCHER_PID}" 2>/dev/null || true
    fi
    if [[ -n "${WATCHER_PID}" ]]; then
      disown "${WATCHER_PID}" 2>/dev/null || true
    fi
    if [[ -n "${IDE_WATCHER_PID}" ]]; then
      disown "${IDE_WATCHER_PID}" 2>/dev/null || true
    fi
    # Disable cleanup trap since we want watchers to keep running
    trap - EXIT INT TERM
  }

  case "${choice}" in
    "Claude Code")
      log_info "Starting Claude Code..."
      log_info "Hot-reload watchers running in background."
      disown_watchers
      if [[ -n "${AI_YOLO_MODE:-}" ]]; then
        log_info "AI_YOLO_MODE enabled - using --dangerously-skip-permissions"
        exec claude --dangerously-skip-permissions
      else
        exec claude
      fi
      ;;
    "Codex")
      log_info "Starting Codex..."
      log_info "Hot-reload watchers running in background."
      disown_watchers
      if [[ -n "${AI_YOLO_MODE:-}" ]]; then
        log_info "AI_YOLO_MODE enabled - using --full-auto"
        exec codex --full-auto
      else
        exec codex
      fi
      ;;
    "Neither")
      log_info "Hot-reload watchers running in background."
      log_info "Use 'tail -f scratch/hot-reload.log' to monitor."
      disown_watchers
      ;;
  esac
}

# Cleanup on exit
cleanup() {
  if [[ -n "${TS_WATCHER_PID}" ]]; then
    log_info "Stopping TypeScript watcher (PID ${TS_WATCHER_PID})..."
    kill "${TS_WATCHER_PID}" 2>/dev/null || true
    wait "${TS_WATCHER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WATCHER_PID}" ]]; then
    log_info "Stopping APK watcher (PID ${WATCHER_PID})..."
    kill "${WATCHER_PID}" 2>/dev/null || true
    wait "${WATCHER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${IDE_WATCHER_PID}" ]]; then
    log_info "Stopping IDE plugin watcher (PID ${IDE_WATCHER_PID})..."
    kill "${IDE_WATCHER_PID}" 2>/dev/null || true
    wait "${IDE_WATCHER_PID}" 2>/dev/null || true
  fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      if [[ $# -lt 2 ]]; then
        log_error "--device requires a value."
        usage
        exit 1
      fi
      DEVICE_ID="$2"
      shift 2
      ;;
    --skip-ai)
      SKIP_AI=true
      shift
      ;;
    --once)
      RUN_ONCE=true
      shift
      ;;
    --update-checksum)
      UPDATE_CHECKSUM=true
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
    --ide)
      if [[ $# -lt 2 ]]; then
        log_error "--ide requires a value."
        usage
        exit 1
      fi
      IDE_NAME="$2"
      shift 2
      ;;
    --no-ide-restart)
      NO_IDE_RESTART=true
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

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Ensure scratch directory exists
mkdir -p "${PROJECT_ROOT}/scratch"

# Check and install dependencies (gum, node, bun)
if ! ensure_dependencies; then
  log_error "Dependency check failed. Exiting."
  exit 1
fi

# Resolve ADB
resolve_adb

# Device resolution is optional - we can still build without a device
HAVE_DEVICE=false
if resolve_device; then
  HAVE_DEVICE=true
fi

if [[ -n "${DEVICE_ID}" ]]; then
  log_info "Target device: ${DEVICE_ID}"
elif [[ "${HAVE_DEVICE}" == "true" ]]; then
  log_info "Target: all connected devices"
else
  log_info "Target: no devices (will install when available)"
fi
log_info "APK path: ${APK_PATH}"
log_info "Gradle: ${ANDROID_DIR}/gradlew :accessibility-service:assembleDebug"

# Build APK
if ! build_apk; then
  log_error "Initial build failed. Fix errors and retry."
  exit 1
fi

# Install if devices available
if [[ "${HAVE_DEVICE}" == "true" ]]; then
  if ! install_apk; then
    log_warn "Initial install failed. Will retry when devices connect."
  fi
else
  log_info "No devices connected. APK built and ready for install."
fi

# IDE plugin setup (macOS only)
setup_ide_plugin() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    log_warn "IDE plugin hot-reload only supported on macOS."
    return 1
  fi

  # Ensure gum is available for interactive prompts
  if ! ensure_gum; then
    if [[ -z "${IDE_NAME}" ]]; then
      log_warn "gum not available. Use --ide <name> to specify the IDE."
      return 1
    fi
  fi

  # Detect and select IDE
  log_info "Detecting installed IDEs..."
  if ! select_ide "${IDE_NAME}"; then
    log_error "IDE selection failed."
    return 1
  fi

  # Resolve plugins directory
  IDE_PLUGINS_DIR=$(get_ide_plugins_dir)
  if [[ -z "${IDE_PLUGINS_DIR}" ]]; then
    log_error "Could not determine plugins directory."
    return 1
  fi

  log_info "Plugins directory: ${IDE_PLUGINS_DIR}"
  # shellcheck disable=SC2153  # IDE_PLUGIN_DIR is defined in lib/ide-plugin.sh
  log_info "IDE plugin source: ${IDE_PLUGIN_DIR}/src"

  # Initial build
  log_info "Building IDE plugin..."
  if ! build_ide_plugin; then
    log_error "IDE plugin build failed. Fix errors and retry."
    return 1
  fi

  # Initial install
  if ! install_ide_plugin "${IDE_PLUGINS_DIR}"; then
    log_error "IDE plugin install failed."
    return 1
  fi

  return 0
}

# Setup IDE plugin (continue even if it fails - APK workflow still works)
IDE_PLUGIN_ENABLED=false
if setup_ide_plugin; then
  IDE_PLUGIN_ENABLED=true
  log_info "IDE plugin setup complete."
else
  log_warn "IDE plugin setup failed. Continuing with APK-only hot-reload."
fi

# Handle --once mode: build/install and exit
if [[ "${RUN_ONCE}" == "true" ]]; then
  checksum="$(compute_checksum)"
  if [[ -n "${checksum}" ]]; then
    log_info "APK sha256: ${checksum}"
    if [[ "${UPDATE_CHECKSUM}" == "true" ]]; then
      update_checksum "${checksum}"
    fi
  fi
  # Restart IDE if plugin was installed
  if [[ "${IDE_PLUGIN_ENABLED}" == "true" && "${NO_IDE_RESTART}" != "true" ]]; then
    restart_ide
  fi
  log_info "Run-once mode complete."
  exit 0
fi

# Kill previous processes and set up new run
kill_previous

update_mcp_json
update_codex_toml

# Change to project root for bun commands
cd "${PROJECT_ROOT}"

# Start TypeScript watcher in background
start_ts_watcher() {
  log_info "Starting TypeScript watcher in background..."
  (watch_ts_loop "${POLL_INTERVAL}") >> "${PROJECT_ROOT}/scratch/ts-hot-reload.log" 2>&1 &
  TS_WATCHER_PID=$!
  log_info "TypeScript watcher started (PID ${TS_WATCHER_PID})"
  log_info "Logs: ${PROJECT_ROOT}/scratch/ts-hot-reload.log"
}

# Start IDE plugin watcher in background
start_ide_watcher() {
  if [[ "${IDE_PLUGIN_ENABLED}" != "true" ]]; then
    return
  fi
  log_info "Starting IDE plugin watcher in background..."
  (ide_plugin_watch_loop "${POLL_INTERVAL}" "${IDE_PLUGINS_DIR}" "${NO_IDE_RESTART}") >> "${PROJECT_ROOT}/scratch/ide-plugin-hot-reload.log" 2>&1 &
  IDE_WATCHER_PID=$!
  log_info "IDE plugin watcher started (PID ${IDE_WATCHER_PID})"
  log_info "Logs: ${PROJECT_ROOT}/scratch/ide-plugin-hot-reload.log"
}

# Restart IDE for initial plugin install (unless --no-ide-restart)
if [[ "${IDE_PLUGIN_ENABLED}" == "true" && "${NO_IDE_RESTART}" != "true" ]]; then
  restart_ide
fi

start_ts_watcher
start_ide_watcher

# Start APK watcher (runs in foreground if --skip-ai, background otherwise)
if [[ "${SKIP_AI}" == "true" ]]; then
  log_info "Hot-reload running."
  log_info "MCP config: ${MCP_JSON}"
  # Run watch loop in foreground
  watch_loop "${POLL_INTERVAL}" "${UPDATE_CHECKSUM}"
else
  # Start watcher in background and prompt for IDE
  start_apk_watcher
  # Give processes a moment to start
  sleep 2
  prompt_ide
fi
