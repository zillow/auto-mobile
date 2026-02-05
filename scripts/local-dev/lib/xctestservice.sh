#!/usr/bin/env bash
#
# XCTestService build, run, and watch utilities for local development.
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT        - Path to project root
#   XCTEST_SERVICE_DIR  - Path to ios/XCTestService directory
#   DERIVED_DATA_PATH   - Path to derived data for XCTestService
#
# Functions:
#   hash_stream()              - Compute SHA256 hash from stdin
#   stat_entry()               - Get file modification time (portable)
#   list_watch_files()         - List XCTestService source files to watch
#   hash_watch_state()         - Hash of all watched file timestamps
#   needs_project_generation() - Check if xcodegen should run
#   run_xcodegen()             - Generate Xcode project with xcodegen
#   build_xctestservice()      - Build XCTestService for testing
#   get_xctestrun_path()       - Find the .xctestrun file in derived data
#   start_xctestservice()      - Start XCTestService on a simulator
#   stop_xctestservice()       - Stop the running XCTestService process
#   watch_loop()               - Watch for changes and rebuild/restart

# Runtime state
XCODEBUILD_PID=""
XCODEBUILD_LOG=""

# Compute SHA256 hash from stdin
hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 | awk '{print $2}'
    return
  fi

  log_error "No SHA256 tool available (sha256sum, shasum, or openssl)."
  exit 1
}

# Get file modification time (portable between macOS and Linux)
stat_entry() {
  local file="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f "%m %N" "${file}"
  else
    stat -c "%Y %n" "${file}"
  fi
}

# List all files to watch for changes
list_watch_files() {
  local watch_dirs=(
    "${XCTEST_SERVICE_DIR}/Sources"
    "${XCTEST_SERVICE_DIR}/Tests"
    "${XCTEST_SERVICE_DIR}/XCTestServiceApp"
  )
  local extra_files=(
    "${XCTEST_SERVICE_DIR}/project.yml"
    "${XCTEST_SERVICE_DIR}/XCTestService.xcodeproj/project.pbxproj"
  )

  if command -v rg >/dev/null 2>&1; then
    rg --files "${watch_dirs[@]}" -g '!**/build/**'
  else
    find "${watch_dirs[@]}" -type f ! -path "*/build/*"
  fi

  for file in "${extra_files[@]}"; do
    if [[ -f "${file}" ]]; then
      echo "${file}"
    fi
  done
}

# Compute hash of all watched file timestamps
hash_watch_state() {
  list_watch_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}

# Check if project.yml is newer than xcodeproj
needs_project_generation() {
  local project_yml="${XCTEST_SERVICE_DIR}/project.yml"
  local xcodeproj="${XCTEST_SERVICE_DIR}/XCTestService.xcodeproj/project.pbxproj"

  if [[ ! -f "${project_yml}" ]]; then
    return 1
  fi

  if [[ ! -f "${xcodeproj}" ]]; then
    return 0
  fi

  local yml_mtime
  local proj_mtime
  yml_mtime=$(stat_entry "${project_yml}" | awk '{print $1}' || echo 0)
  proj_mtime=$(stat_entry "${xcodeproj}" | awk '{print $1}' || echo 0)

  [[ "${yml_mtime}" -gt "${proj_mtime}" ]]
}

# Run xcodegen to generate the Xcode project
run_xcodegen() {
  if ! command -v xcodegen >/dev/null 2>&1; then
    log_warn "xcodegen not available; skipping project generation."
    return 1
  fi

  log_info "Running xcodegen..."
  if (cd "${XCTEST_SERVICE_DIR}" && xcodegen generate); then
    log_info "xcodegen completed."
    return 0
  fi

  log_warn "xcodegen failed."
  return 1
}

# Build XCTestService using xcodebuild build-for-testing
build_xctestservice() {
  if ! command -v xcodebuild >/dev/null 2>&1; then
    log_error "xcodebuild not found. Install Xcode."
    return 1
  fi

  if needs_project_generation; then
    run_xcodegen || true
  fi

  log_info "Building XCTestService (build-for-testing)..."
  if ! (cd "${XCTEST_SERVICE_DIR}" && xcodebuild build-for-testing \
      -scheme XCTestServiceApp \
      -destination "generic/platform=iOS Simulator" \
      -derivedDataPath "${DERIVED_DATA_PATH}" \
      -quiet); then
    log_error "xcodebuild build-for-testing failed."
    return 1
  fi

  return 0
}

# Find the .xctestrun file in derived data
get_xctestrun_path() {
  local products_dir="${DERIVED_DATA_PATH}/Build/Products"
  if [[ ! -d "${products_dir}" ]]; then
    echo ""
    return
  fi

  local xctestrun_file
  xctestrun_file=$(find "${products_dir}" -maxdepth 1 -name "*.xctestrun" 2>/dev/null | head -1 || true)
  if [[ -n "${xctestrun_file}" ]]; then
    echo "${xctestrun_file}"
    return
  fi

  echo ""
}

# Start XCTestService on a simulator
start_xctestservice() {
  local simulator_id="$1"
  local port="${XCTESTSERVICE_PORT:-8765}"
  local xctestrun_path
  xctestrun_path="$(get_xctestrun_path)"

  if [[ -z "${simulator_id}" ]]; then
    log_warn "No booted simulator available; cannot start XCTestService."
    return 1
  fi

  XCODEBUILD_LOG="${PROJECT_ROOT}/scratch/ios-xctestservice.log"
  local cmd=()

  if [[ -n "${xctestrun_path}" ]]; then
    log_info "Starting XCTestService (test-without-building)..."
    cmd=(
      xcodebuild
      test-without-building
      -xctestrun "${xctestrun_path}"
      -destination "id=${simulator_id}"
      -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService
      "XCTESTSERVICE_PORT=${port}"
    )
  else
    log_info "Starting XCTestService (xcodebuild test)..."
    cmd=(
      xcodebuild
      test
      -scheme XCTestServiceApp
      -destination "id=${simulator_id}"
      -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService
      "XCTESTSERVICE_PORT=${port}"
    )
  fi

  if [[ -n "${XCTESTSERVICE_BUNDLE_ID:-}" ]]; then
    cmd+=("XCTESTSERVICE_BUNDLE_ID=${XCTESTSERVICE_BUNDLE_ID}")
  fi
  if [[ -n "${XCTESTSERVICE_TIMEOUT:-}" ]]; then
    cmd+=("XCTESTSERVICE_TIMEOUT=${XCTESTSERVICE_TIMEOUT}")
  fi

  (cd "${XCTEST_SERVICE_DIR}" && "${cmd[@]}") > "${XCODEBUILD_LOG}" 2>&1 &
  XCODEBUILD_PID=$!
  log_info "XCTestService started (PID ${XCODEBUILD_PID})"
  log_info "Logs: ${XCODEBUILD_LOG}"
  return 0
}

# Stop XCTestService process
stop_xctestservice() {
  if [[ -n "${XCODEBUILD_PID}" ]] && kill -0 "${XCODEBUILD_PID}" 2>/dev/null; then
    log_info "Stopping XCTestService (PID ${XCODEBUILD_PID})..."
    kill "${XCODEBUILD_PID}" 2>/dev/null || true

    # Wait up to 5 seconds for graceful exit
    local count=0
    while kill -0 "${XCODEBUILD_PID}" 2>/dev/null && [[ ${count} -lt 5 ]]; do
      sleep 1
      count=$((count + 1))
    done

    # Force kill if still running
    if kill -0 "${XCODEBUILD_PID}" 2>/dev/null; then
      log_warn "Force killing XCTestService..."
      kill -9 "${XCODEBUILD_PID}" 2>/dev/null || true
    fi
  fi
  XCODEBUILD_PID=""
}

# Watch for changes and rebuild/restart
# Args: poll_interval
watch_loop() {
  local poll_interval="${1:-2}"
  local last_hash
  local last_simulator=""
  local needs_restart=false

  log_info "Watching for changes (poll interval ${poll_interval}s)."
  last_hash="$(hash_watch_state)"

  # Initial build
  if ! build_xctestservice; then
    log_warn "Initial build failed; waiting for changes."
  fi

  while true; do
    sleep "${poll_interval}"

    local current_simulator
    if [[ -n "${SIMULATOR_ID_OVERRIDE:-}" ]]; then
      if xcrun simctl list devices booted -j 2>/dev/null | \
        grep -q "\"${SIMULATOR_ID_OVERRIDE}\""; then
        current_simulator="${SIMULATOR_ID_OVERRIDE}"
      else
        current_simulator=""
      fi
    else
      current_simulator=$(xcrun simctl list devices booted -j 2>/dev/null | \
        grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "//;s/"$//')
    fi

    if [[ "${current_simulator}" != "${last_simulator}" ]]; then
      if [[ -n "${current_simulator}" ]]; then
        log_info "Booted simulator: ${current_simulator}"
        needs_restart=true
      else
        log_warn "No booted simulator detected."
      fi
      last_simulator="${current_simulator}"
    fi

    local next_hash
    next_hash="$(hash_watch_state)"
    if [[ "${next_hash}" != "${last_hash}" ]]; then
      log_info "Change detected. Rebuilding..."
      if build_xctestservice; then
        last_hash="$(hash_watch_state)"
        needs_restart=true
      else
        log_warn "Build failed; waiting for next change."
      fi
    fi

    if [[ -n "${XCODEBUILD_PID}" ]] && ! kill -0 "${XCODEBUILD_PID}" 2>/dev/null; then
      log_warn "XCTestService process exited."
      XCODEBUILD_PID=""
      needs_restart=true
    fi

    if [[ "${needs_restart}" == "true" ]] && [[ -n "${last_simulator}" ]]; then
      stop_xctestservice
      start_xctestservice "${last_simulator}"
      needs_restart=false
    fi
  done
}
