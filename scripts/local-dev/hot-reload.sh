#!/usr/bin/env bash
#
# AutoMobile hot-reload development workflow.
#
# Builds all components, then launches a background watcher that monitors for
# changes and rebuilds/restarts as needed. The script exits after setup; the
# background watcher keeps running until another invocation replaces it or
# the timeout expires (default 60 minutes).
#
# Components watched (in order):
#   1. Desktop app (Compose Desktop via desktop-core + desktop-app)
#   2. Android AccessibilityService (with sha updates for TypeScript)
#   3. iOS CtrlProxy (with sha updates for TypeScript)
#   4. MCP TypeScript daemon
#
# Usage:
#   ./scripts/local-dev/hot-reload.sh [options]
#
# Options:
#   --device <id>        Target specific ADB device
#   --simulator <udid>   Target specific iOS simulator
#   --once               Build all components once and exit
#   --poll-interval <s>  File watch interval (default: 2)
#   --timeout <m>        Background watcher timeout in minutes (default: 60)
#   --help               Show help
#
# Environment:
#   ANDROID_SERIAL       ADB device id override
#   CTRL_PROXY_IOS_PORT   Override CtrlProxy iOS port (default: 8765)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export PROJECT_ROOT

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
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/ctrl-proxy-ios.sh"

# Path constants
ANDROID_DIR="${PROJECT_ROOT}/android"
SERVICE_DIR="${ANDROID_DIR}/control-proxy"
APK_PATH="${SERVICE_DIR}/build/outputs/apk/debug/control-proxy-debug.apk"
CTRL_PROXY_IOS_DIR="${PROJECT_ROOT}/ios/control-proxy"
DERIVED_DATA_PATH="/tmp/automobile-ctrl-proxy"
PID_FILE="${PROJECT_ROOT}/.automobile-hot-reload.pid"

# CLI options with defaults
DEVICE_ID=""
SIMULATOR_ID=""
RUN_ONCE=false
POLL_INTERVAL=2
TIMEOUT_MINUTES=60

# Runtime state
DESKTOP_APP_ENABLED=false
ANDROID_ENABLED=false
IOS_ENABLED=false
HAVE_DEVICE=false

# Track last hashes for change detection
LAST_IDE_PLUGIN_HASH=""
LAST_APK_HASH=""
LAST_IOS_HASH=""
LAST_TS_HASH=""

# Track device/simulator state
LAST_ADB_DEVICES=""
LAST_SIMULATOR=""
CTRL_PROXY_SIMULATOR=""      # Simulator CtrlProxy is currently targeting
APK_NEEDS_INSTALL=false
IOS_NEEDS_RESTART=false

usage() {
  cat << EOF
Usage: $0 [options]

AutoMobile unified hot-reload development workflow.

Watches all components in a single loop:
  1. Desktop app (Compose Desktop)
  2. Android AccessibilityService (with sha updates)
  3. iOS CtrlProxy (with sha updates)
  4. MCP TypeScript daemon

Options:
  --device <id>        Target specific ADB device
  --simulator <udid>   Target specific iOS simulator
  --once               Build all components once and exit
  --poll-interval <s>  File watch interval (default: 2)
  --timeout <m>        Background watcher timeout in minutes (default: 60)
  --help               Show this help text

Environment variables:
  ANDROID_SERIAL       ADB device id override
  CTRL_PROXY_IOS_PORT   Override CtrlProxy iOS port (default: 8765)
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
      # Wait up to 10 seconds for graceful shutdown (allows CtrlProxy iOS cleanup)
      local count=0
      while kill -0 "${old_pid}" 2>/dev/null && [[ ${count} -lt 10 ]]; do
        sleep 1
        count=$((count + 1))
      done
      if kill -0 "${old_pid}" 2>/dev/null; then
        log_warn "Force killing previous watcher..."
        kill -9 "${old_pid}" 2>/dev/null || true
      fi
    fi
    rm -f "${PID_FILE}"
  fi

  local pids
  pids=$(pgrep -f "hot-reload.sh" 2>/dev/null | grep -v "$$" || true)
  if [[ -n "${pids}" ]]; then
    log_info "Killing orphaned hot-reload processes..."
    echo "${pids}" | xargs kill 2>/dev/null || true
    sleep 1
    # Force kill if still running
    pids=$(pgrep -f "hot-reload.sh" 2>/dev/null | grep -v "$$" || true)
    if [[ -n "${pids}" ]]; then
      log_warn "Force killing orphaned hot-reload processes..."
      echo "${pids}" | xargs kill -9 2>/dev/null || true
    fi
  fi

  # Kill any orphaned xcodebuild.*test.*CtrlProxy that may
  # have been left behind when a watcher was SIGKILL'd
  pids=$(pgrep -f "xcodebuild.*test.*CtrlProxy" 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    log_info "Killing orphaned CtrlProxy iOS xcodebuild processes: ${pids}"
    echo "${pids}" | xargs kill 2>/dev/null || true
    sleep 2
    pids=$(pgrep -f "xcodebuild.*test.*CtrlProxy" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      log_warn "Force killing orphaned xcodebuild processes..."
      echo "${pids}" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

# Reload MCP daemon by restarting the daemon process
reload_mcp_daemon() {
  log_info "Restarting MCP daemon..."
  if command -v auto-mobile >/dev/null 2>&1; then
    # Run daemon restart in background with timeout to prevent hanging
    local daemon_log="${PROJECT_ROOT}/scratch/daemon-restart.log"
    auto-mobile --daemon restart --debug --debug-perf > "${daemon_log}" 2>&1 &
    local daemon_pid=$!

    # Wait up to 30 seconds for daemon restart
    local count=0
    while kill -0 "${daemon_pid}" 2>/dev/null && [[ ${count} -lt 30 ]]; do
      sleep 1
      count=$((count + 1))
    done

    if kill -0 "${daemon_pid}" 2>/dev/null; then
      log_warn "Daemon restart timed out, force killing..."
      kill -9 "${daemon_pid}" 2>/dev/null || true
      # Also kill any daemon processes
      local pids
      pids=$(pgrep -f "auto-mobile.*--daemon-mode" 2>/dev/null || true)
      if [[ -n "${pids}" ]]; then
        echo "${pids}" | xargs kill -9 2>/dev/null || true
      fi
    else
      # Check exit status of completed process
      local exit_status=0
      wait "${daemon_pid}" || exit_status=$?
      if [[ ${exit_status} -eq 0 ]]; then
        log_info "MCP daemon restarted."
      else
        log_warn "Daemon restart failed (exit ${exit_status}). See ${daemon_log}"
      fi
    fi
  else
    local pids
    pids=$(pgrep -f "auto-mobile.*--daemon-mode" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      log_info "Killing daemon processes: ${pids}"
      echo "${pids}" | xargs kill 2>/dev/null || true
      sleep 1
      # Force kill if still running
      pids=$(pgrep -f "auto-mobile.*--daemon-mode" 2>/dev/null || true)
      if [[ -n "${pids}" ]]; then
        log_warn "Force killing daemon processes..."
        echo "${pids}" | xargs kill -9 2>/dev/null || true
      fi
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
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}

# Build TypeScript
build_typescript() {
  log_info "Building TypeScript..."
  if (cd "${PROJECT_ROOT}" && bunx turbo run build --output-logs=errors-only); then
    log_info "TypeScript build complete."
    return 0
  else
    log_warn "TypeScript build failed."
    return 1
  fi
}

# iOS-specific file list (separate from APK file list)
list_ios_watch_files() {
  local watch_dirs=(
    "${CTRL_PROXY_IOS_DIR}/Sources"
    "${CTRL_PROXY_IOS_DIR}/Tests"
    "${CTRL_PROXY_IOS_DIR}/CtrlProxyApp"
  )
  local extra_files=(
    "${CTRL_PROXY_IOS_DIR}/project.yml"
    "${CTRL_PROXY_IOS_DIR}/CtrlProxy.xcodeproj/project.pbxproj"
  )

  if command -v rg >/dev/null 2>&1; then
    rg --files "${watch_dirs[@]}" -g '!**/build/**' 2>/dev/null || true
  else
    find "${watch_dirs[@]}" -type f ! -path "*/build/*" 2>/dev/null || true
  fi

  for file in "${extra_files[@]}"; do
    if [[ -f "${file}" ]]; then
      echo "${file}"
    fi
  done
}

# iOS-specific hash (separate from APK hash)
hash_ios_watch_state() {
  list_ios_watch_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}

# APK-specific file list (renamed from hash_watch_state collision)
list_apk_watch_files() {
  local watch_dirs=(
    "${SERVICE_DIR}"
    "${ANDROID_DIR}/auto-mobile-sdk"
  )
  local extra_files=(
    "${ANDROID_DIR}/build.gradle.kts"
    "${ANDROID_DIR}/settings.gradle.kts"
    "${ANDROID_DIR}/gradle.properties"
  )

  if command -v rg >/dev/null 2>&1; then
    rg --files "${watch_dirs[@]}" -g '!**/build/**' 2>/dev/null || true
  else
    find "${watch_dirs[@]}" -type f ! -path "*/build/*" 2>/dev/null || true
  fi

  for file in "${extra_files[@]}"; do
    if [[ -f "${file}" ]]; then
      echo "${file}"
    fi
  done
}

# APK-specific hash (renamed from hash_watch_state collision)
hash_apk_watch_state() {
  list_apk_watch_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}

# Setup desktop app
setup_desktop_app() {
  log_info "Building desktop app (desktop-core + desktop-app)..."
  if ! build_desktop_app; then
    log_error "Desktop app build failed. Fix errors and retry."
    return 1
  fi
  return 0
}

# Setup Android
setup_android() {
  resolve_adb

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
  log_info "Building AccessibilityService..."

  if ! build_apk; then
    log_error "Initial APK build failed. Fix errors and retry."
    return 1
  fi

  # Update SHA after successful build (regardless of device availability)
  local checksum
  checksum="$(compute_checksum)"
  if [[ -n "${checksum}" ]]; then
    log_info "APK sha256: ${checksum}"
    update_checksum "${checksum}"
  fi

  if [[ "${HAVE_DEVICE}" == "true" ]]; then
    if ! install_apk; then
      log_warn "Initial install failed. Will retry when devices connect."
    fi
  else
    log_info "No devices connected. APK built and ready for install."
  fi

  return 0
}

# Setup iOS
setup_ios() {
  if ! command -v xcodebuild >/dev/null 2>&1; then
    log_warn "xcodebuild not found. Skipping iOS setup."
    return 1
  fi

  if [[ ! -d "${CTRL_PROXY_IOS_DIR}" ]]; then
    log_warn "CtrlProxy iOS directory not found: ${CTRL_PROXY_IOS_DIR}"
    return 1
  fi

  if [[ -n "${SIMULATOR_ID}" ]]; then
    export SIMULATOR_ID_OVERRIDE="${SIMULATOR_ID}"
    log_info "Target simulator: ${SIMULATOR_ID} (must be booted)"
  else
    log_info "Target: booted simulator (will start service when available)"
  fi

  log_info "Derived data: ${DERIVED_DATA_PATH}"
  log_info "Building CtrlProxy iOS..."

  if ! build_ctrl_proxy_ios; then
    log_warn "Initial CtrlProxy iOS build failed. Will retry on changes."
    return 1
  fi

  return 0
}

# Get current booted simulator
get_current_simulator() {
  if [[ -n "${SIMULATOR_ID_OVERRIDE:-}" ]]; then
    if xcrun simctl list devices booted -j 2>/dev/null | \
      grep -q "\"${SIMULATOR_ID_OVERRIDE}\""; then
      echo "${SIMULATOR_ID_OVERRIDE}"
    fi
  else
    xcrun simctl list devices booted -j 2>/dev/null | \
      grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "//;s/"$//'
  fi
}

# Unified watch loop
unified_watch_loop() {
  local poll_interval="${1:-2}"

  log_info "Starting unified watch loop (poll interval ${poll_interval}s)..."
  log_info "Watching: Desktop app=$(bool_str ${DESKTOP_APP_ENABLED}), Android=$(bool_str ${ANDROID_ENABLED}), iOS=$(bool_str ${IOS_ENABLED}), TypeScript=true"

  # Initialize hashes
  if [[ "${DESKTOP_APP_ENABLED}" == "true" ]]; then
    LAST_IDE_PLUGIN_HASH="$(hash_ide_plugin_state)"
  fi
  if [[ "${ANDROID_ENABLED}" == "true" ]]; then
    LAST_APK_HASH="$(hash_apk_watch_state)"
  fi
  if [[ "${IOS_ENABLED}" == "true" ]]; then
    LAST_IOS_HASH="$(hash_ios_watch_state)"
  fi
  LAST_TS_HASH="$(hash_ts_state)"

  # Initialize device state
  if [[ "${ANDROID_ENABLED}" == "true" ]]; then
    LAST_ADB_DEVICES=$(get_connected_devices | sort | tr '\n' ' ')
  fi
  if [[ "${IOS_ENABLED}" == "true" ]]; then
    LAST_SIMULATOR="$(get_current_simulator)"
  fi

  while true; do
    sleep "${poll_interval}"

    # Check timeout if running with a deadline
    if [[ -n "${WATCHER_START_TIME:-}" ]] && [[ -n "${MAX_DURATION:-}" ]]; then
      local elapsed=$(( $(date +%s) - WATCHER_START_TIME ))
      if [[ ${elapsed} -ge ${MAX_DURATION} ]]; then
        log_info "Hot-reload timeout reached (${TIMEOUT_MINUTES:-60} minutes). Stopping."
        return 0
      fi
    fi

    # === 1. Check desktop app changes ===
    if [[ "${DESKTOP_APP_ENABLED}" == "true" ]]; then
      local next_ide_hash
      next_ide_hash="$(hash_ide_plugin_state)"
      if [[ "${next_ide_hash}" != "${LAST_IDE_PLUGIN_HASH}" ]]; then
        log_info "[Desktop App] Change detected. Rebuilding and restarting..."
        LAST_IDE_PLUGIN_HASH="${next_ide_hash}"

        if build_desktop_app; then
          run_desktop_app
        else
          log_warn "[Desktop App] Build failed; waiting for next change."
        fi

        LAST_IDE_PLUGIN_HASH="$(hash_ide_plugin_state)"
      fi
    fi

    # === 2. Check Android changes ===
    if [[ "${ANDROID_ENABLED}" == "true" ]]; then
      # Check device list changes
      local current_devices
      current_devices=$(get_connected_devices | sort | tr '\n' ' ')
      local devices_changed=false

      if [[ "${current_devices}" != "${LAST_ADB_DEVICES}" ]]; then
        devices_changed=true
        if [[ -n "${current_devices}" ]] && [[ -z "${LAST_ADB_DEVICES}" ]]; then
          log_info "[Android] Device(s) connected: ${current_devices}"
        elif [[ -z "${current_devices}" ]] && [[ -n "${LAST_ADB_DEVICES}" ]]; then
          log_info "[Android] All devices disconnected."
        elif [[ -n "${current_devices}" ]]; then
          log_info "[Android] Device list changed: ${current_devices}"
        fi
        LAST_ADB_DEVICES="${current_devices}"
      fi

      # Check file changes
      local next_apk_hash
      next_apk_hash="$(hash_apk_watch_state)"
      local files_changed=false

      if [[ "${next_apk_hash}" != "${LAST_APK_HASH}" ]]; then
        files_changed=true
        LAST_APK_HASH="${next_apk_hash}"
      fi

      # Rebuild if files changed
      if [[ "${files_changed}" == "true" ]]; then
        log_info "[Android] Change detected. Rebuilding..."
        if build_apk; then
          APK_NEEDS_INSTALL=true
          LAST_APK_HASH="$(hash_apk_watch_state)"
          # Update SHA after successful build (regardless of device availability)
          local checksum
          checksum="$(compute_checksum)"
          if [[ -n "${checksum}" ]]; then
            log_info "[Android] APK sha256: ${checksum}"
            update_checksum "${checksum}"
          fi
        else
          log_warn "[Android] Build failed; waiting for next change."
        fi
      fi

      # Install if pending and devices available
      if [[ "${APK_NEEDS_INSTALL}" == "true" ]] || [[ "${devices_changed}" == "true" ]]; then
        if [[ -n "${current_devices}" ]] && [[ -f "${APK_PATH}" ]]; then
          if install_apk; then
            APK_NEEDS_INSTALL=false
            log_info "[Android] APK installed to device(s)."
          else
            log_warn "[Android] Install failed; will retry."
          fi
        fi
      fi
    fi

    # === 3. Check iOS changes ===
    if [[ "${IOS_ENABLED}" == "true" ]]; then
      # Check simulator state
      local current_simulator
      current_simulator="$(get_current_simulator)"

      if [[ "${current_simulator}" != "${LAST_SIMULATOR}" ]]; then
        if [[ -n "${current_simulator}" ]]; then
          if [[ "${current_simulator}" != "${CTRL_PROXY_SIMULATOR}" ]]; then
            # Genuinely new/different simulator — restart CtrlProxy for it
            log_info "[iOS] New booted simulator: ${current_simulator}"
            IOS_NEEDS_RESTART=true
          else
            # Same simulator CtrlProxy is already targeting (reappeared after xcodebuild reboot)
            log_info "[iOS] Simulator returned: ${current_simulator}"
          fi
        else
          log_warn "[iOS] No booted simulator detected."
        fi
        LAST_SIMULATOR="${current_simulator}"
      fi

      # Check file changes
      local next_ios_hash
      next_ios_hash="$(hash_ios_watch_state)"

      if [[ "${next_ios_hash}" != "${LAST_IOS_HASH}" ]]; then
        log_info "[iOS] Change detected. Rebuilding..."
        if build_ctrl_proxy_ios; then
          LAST_IOS_HASH="$(hash_ios_watch_state)"
          IOS_NEEDS_RESTART=true
          # Update TypeScript checksum after iOS build
          local ios_checksum
          ios_checksum="$(get_xctestrun_path | hash_stream)"
          if [[ -n "${ios_checksum}" ]]; then
            log_info "[iOS] Build hash: ${ios_checksum:0:16}..."
          fi
        else
          log_warn "[iOS] Build failed; waiting for next change."
        fi
      fi

      # Check if CtrlProxy iOS process died
      if [[ -n "${XCODEBUILD_PID}" ]] && ! kill -0 "${XCODEBUILD_PID}" 2>/dev/null; then
        log_warn "[iOS] CtrlProxy iOS process exited."
        XCODEBUILD_PID=""
        CTRL_PROXY_SIMULATOR=""
        IOS_NEEDS_RESTART=true
      fi

      # Restart if needed
      if [[ "${IOS_NEEDS_RESTART}" == "true" ]] && [[ -n "${LAST_SIMULATOR}" ]]; then
        stop_ctrl_proxy_ios
        start_ctrl_proxy_ios "${LAST_SIMULATOR}"
        CTRL_PROXY_SIMULATOR="${LAST_SIMULATOR}"
        IOS_NEEDS_RESTART=false
      fi
    fi

    # === 4. Check TypeScript changes ===
    local next_ts_hash
    next_ts_hash="$(hash_ts_state)"
    if [[ "${next_ts_hash}" != "${LAST_TS_HASH}" ]]; then
      log_info "[TypeScript] Change detected. Rebuilding and reloading MCP daemon..."
      if build_typescript; then
        reload_mcp_daemon
      fi
      LAST_TS_HASH="${next_ts_hash}"
    fi
  done
}

# Helper for boolean display
bool_str() {
  if [[ "$1" == "true" ]]; then
    echo "yes"
  else
    echo "no"
  fi
}

# Cleanup on foreground exit (only removes PID file if we fail before backgrounding)
cleanup() {
  rm -f "${PID_FILE}"
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
    --simulator)
      if [[ $# -lt 2 ]]; then
        log_error "--simulator requires a value."
        usage
        exit 1
      fi
      SIMULATOR_ID="$2"
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
    --timeout)
      if [[ $# -lt 2 ]]; then
        log_error "--timeout requires a value."
        usage
        exit 1
      fi
      TIMEOUT_MINUTES="$2"
      shift 2
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

# Check and install dependencies
if ! ensure_dependencies; then
  log_error "Dependency check failed. Exiting."
  exit 1
fi

log_info "=== AutoMobile Unified Hot-Reload ==="

# Setup desktop app
if setup_desktop_app; then
  DESKTOP_APP_ENABLED=true
  log_info "Desktop app setup complete."
else
  log_warn "Desktop app setup failed. Continuing without desktop app hot-reload."
fi

# Setup Android
if setup_android; then
  ANDROID_ENABLED=true
  log_info "Android setup complete."
else
  log_warn "Android setup failed. Continuing without Android hot-reload."
fi

# Setup iOS
if setup_ios; then
  IOS_ENABLED=true
  log_info "iOS setup complete."
else
  log_warn "iOS setup failed. Continuing without iOS hot-reload."
fi

# Handle --once mode
if [[ "${RUN_ONCE}" == "true" ]]; then
  log_info "Run-once mode complete."
  if [[ "${DESKTOP_APP_ENABLED}" == "true" ]]; then
    run_desktop_app
  fi
  exit 0
fi

# Kill previous background watchers
kill_previous

# Change to project root
cd "${PROJECT_ROOT}"

# Launch desktop app for initial run (foreground, before backgrounding watcher)
if [[ "${DESKTOP_APP_ENABLED}" == "true" ]]; then
  run_desktop_app
fi

# Launch background watcher
WATCHER_LOG="${PROJECT_ROOT}/scratch/hot-reload.log"
: > "${WATCHER_LOG}"

(
  # Background watcher cleanup — stops CtrlProxy iOS and removes PID file
  # shellcheck disable=SC2317,SC2329 # invoked indirectly via trap
  watcher_cleanup() {
    log_info "Watcher stopping..."
    stop_desktop_app
    stop_ctrl_proxy_ios
    rm -f "${PID_FILE}"
  }
  trap watcher_cleanup EXIT TERM INT HUP

  WATCHER_START_TIME=$(date +%s)
  MAX_DURATION=$(( TIMEOUT_MINUTES * 60 ))

  # Start initial iOS CtrlProxy if simulator available
  if [[ "${IOS_ENABLED}" == "true" ]]; then
    initial_simulator="$(get_current_simulator)"
    if [[ -n "${initial_simulator}" ]]; then
      start_ctrl_proxy_ios "${initial_simulator}"
      LAST_SIMULATOR="${initial_simulator}"
      CTRL_PROXY_SIMULATOR="${initial_simulator}"
    fi
  fi

  unified_watch_loop "${POLL_INTERVAL}"
) >> "${WATCHER_LOG}" 2>&1 &

WATCHER_PID=$!
echo "${WATCHER_PID}" > "${PID_FILE}"
disown "${WATCHER_PID}"

# Clear the foreground trap — PID file now belongs to the background watcher
trap - EXIT INT TERM

log_info "Hot-reload watcher running in background (PID ${WATCHER_PID})."
log_info "Auto-stops after ${TIMEOUT_MINUTES} minutes. Re-run to restart."
log_info "Watch logs: tail -f ${WATCHER_LOG}"
