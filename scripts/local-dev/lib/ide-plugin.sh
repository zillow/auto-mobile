#!/usr/bin/env bash
#
# IDE plugin build, install, and watch utilities for local development.
# Now targets the desktop-app module (Compose Desktop) instead of the
# IntelliJ plugin, so there is no IDE restart dance.
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT - Path to project root
#
# Functions:
#   build_desktop_app()               - Run gradlew :desktop-app:build -x test
#   run_desktop_app()                 - Launch desktop-app via gradlew :desktop-app:run
#   stop_desktop_app()                - Kill running desktop-app process
#   list_ide_plugin_watch_files()     - Files to watch for changes (desktop-core + desktop-app)
#   hash_ide_plugin_state()           - Hash of watched file timestamps

# Desktop app paths
ANDROID_DIR="${PROJECT_ROOT}/android"
DESKTOP_CORE_DIR="${ANDROID_DIR}/desktop-core"
DESKTOP_APP_DIR="${ANDROID_DIR}/desktop-app"

# Runtime state
DESKTOP_APP_PID=""

# Build the desktop app (compile only, no tests)
build_desktop_app() {
  log_info "Building desktop app..."
  if (cd "${ANDROID_DIR}" && ./gradlew :desktop-app:build -x test --quiet); then
    log_info "Desktop app build complete."
    return 0
  else
    log_warn "Desktop app build failed."
    return 1
  fi
}

# Alias for backwards-compat with hot-reload.sh
build_ide_plugin() {
  build_desktop_app
}

# Install is a no-op for desktop app (no IDE plugin zip to copy)
install_ide_plugin() {
  return 0
}

# Launch the desktop app in the background
run_desktop_app() {
  stop_desktop_app
  log_info "Launching desktop app..."
  (cd "${ANDROID_DIR}" && ./gradlew :desktop-app:run --quiet) &
  DESKTOP_APP_PID=$!
  log_info "Desktop app running (PID ${DESKTOP_APP_PID})."
}

# Stop the running desktop app
stop_desktop_app() {
  if [[ -n "${DESKTOP_APP_PID}" ]] && kill -0 "${DESKTOP_APP_PID}" 2>/dev/null; then
    log_info "Stopping desktop app (PID ${DESKTOP_APP_PID})..."
    kill "${DESKTOP_APP_PID}" 2>/dev/null || true
    local count=0
    while kill -0 "${DESKTOP_APP_PID}" 2>/dev/null && [[ ${count} -lt 5 ]]; do
      sleep 1
      count=$((count + 1))
    done
    if kill -0 "${DESKTOP_APP_PID}" 2>/dev/null; then
      kill -9 "${DESKTOP_APP_PID}" 2>/dev/null || true
    fi
    DESKTOP_APP_PID=""
  fi
  # Also kill any orphaned desktop-app Gradle run processes
  local pids
  pids=$(pgrep -f "desktop-app:run" 2>/dev/null; pgrep -f "dev.jasonpearson.automobile.desktop.MainKt" 2>/dev/null) || true
  if [[ -n "${pids}" ]]; then
    echo "${pids}" | xargs kill 2>/dev/null || true
  fi
}

# List all files to watch for changes (desktop-core + desktop-app source)
list_ide_plugin_watch_files() {
  local watch_dirs=(
    "${DESKTOP_CORE_DIR}/src"
    "${DESKTOP_APP_DIR}/src"
  )
  local extra_files=(
    "${DESKTOP_CORE_DIR}/build.gradle.kts"
    "${DESKTOP_APP_DIR}/build.gradle.kts"
  )

  # Use ripgrep if available, otherwise find
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

# Compute hash of all watched file timestamps
hash_ide_plugin_state() {
  list_ide_plugin_watch_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}
