#!/usr/bin/env bash
#
# APK build, install, and watch utilities for local development.
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT - Path to project root
#   ANDROID_DIR  - Path to android directory
#   SERVICE_DIR  - Path to accessibility-service directory
#   APK_PATH     - Path to built APK
#   ADB_BIN      - Path to adb binary (from lib/adb.sh)
#   DEVICE_ID    - Target device ID (optional, empty = all devices)
#
# Functions:
#   hash_stream()           - Compute SHA256 hash from stdin
#   stat_entry()            - Get file modification time (portable)
#   list_watch_files()      - List files to watch for changes
#   hash_watch_state()      - Hash of all watched file timestamps
#   build_apk()             - Build the accessibility service APK
#   install_apk_to_device() - Install APK to specific device
#   install_apk()           - Install APK to target device(s)
#   compute_checksum()      - Compute SHA256 of APK
#   update_checksum()       - Update release.ts with APK checksum
#   build_install_cycle()   - Full build + install + checksum cycle
#   watch_loop()            - Watch for changes and rebuild/reinstall

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
    "${SERVICE_DIR}"
    "${ANDROID_DIR}/auto-mobile-sdk"
  )
  local extra_files=(
    "${ANDROID_DIR}/build.gradle.kts"
    "${ANDROID_DIR}/settings.gradle.kts"
    "${ANDROID_DIR}/gradle.properties"
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

# Build the accessibility service APK
build_apk() {
  log_info "Building AccessibilityService..."
  if ! (cd "${ANDROID_DIR}" && ./gradlew :accessibility-service:assembleDebug); then
    log_error "Gradle build failed."
    return 1
  fi

  if [[ ! -f "${APK_PATH}" ]]; then
    log_error "APK not found at ${APK_PATH}"
    return 1
  fi

  return 0
}

# Install APK to a specific device
install_apk_to_device() {
  local device="$1"
  log_info "Installing APK to ${device}..."
  if ! "${ADB_BIN}" -s "${device}" install -r "${APK_PATH}"; then
    log_warn "ADB install failed for ${device}."
    return 1
  fi
  log_info "APK installed to ${device}."
  return 0
}

# Install APK to target device(s)
install_apk() {
  # If a specific device is set, install only to that device
  if [[ -n "${DEVICE_ID}" ]]; then
    install_apk_to_device "${DEVICE_ID}"
    return $?
  fi

  # Otherwise, install to all connected devices
  local devices
  devices=$(get_connected_devices)
  if [[ -z "${devices}" ]]; then
    log_warn "No devices connected. Skipping install."
    return 1
  fi

  local success=0
  local fail=0
  while IFS= read -r device; do
    if install_apk_to_device "${device}"; then
      ((success++))
    else
      ((fail++))
    fi
  done <<< "${devices}"

  log_info "Install complete: ${success} succeeded, ${fail} failed."
  [[ ${success} -gt 0 ]]
}

# Compute SHA256 checksum of APK
compute_checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${APK_PATH}" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${APK_PATH}" | awk '{print $1}'
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "${APK_PATH}" | awk '{print $2}'
    return
  fi

  echo ""
}

# Update src/constants/release.ts with APK checksum
update_checksum() {
  local checksum="$1"
  log_info "Updating src/constants/release.ts with checksum ${checksum}"
  APK_SHA256_CHECKSUM="${checksum}" bash "${PROJECT_ROOT}/scripts/generate-release-constants.sh"
}

# Full build + install + checksum cycle
build_install_cycle() {
  local update_checksum_flag="${1:-false}"
  local started_at
  started_at=$(date +%s)

  if ! build_apk; then
    return 1
  fi

  if ! install_apk; then
    return 1
  fi

  local checksum
  checksum="$(compute_checksum)"
  if [[ -n "${checksum}" ]]; then
    log_info "APK sha256: ${checksum}"
    if [[ "${update_checksum_flag}" == "true" ]]; then
      update_checksum "${checksum}"
    fi
  fi

  local finished_at
  finished_at=$(date +%s)
  log_info "Deploy complete in $((finished_at - started_at))s."
  return 0
}

# Watch for changes and rebuild/reinstall
# Args: poll_interval update_checksum_flag
watch_loop() {
  local poll_interval="${1:-2}"
  local update_checksum_flag="${2:-false}"

  log_info "Watching for changes (poll interval ${poll_interval}s)."
  local last_hash
  last_hash="$(hash_watch_state)"
  local last_devices=""
  local apk_needs_install=false

  # If we have a built APK but no devices yet, mark for install
  if [[ -f "${APK_PATH}" ]] && [[ -z "$(get_connected_devices)" ]]; then
    apk_needs_install=true
  fi

  while true; do
    sleep "${poll_interval}"

    # Check for file changes
    local next_hash
    next_hash="$(hash_watch_state)"
    local files_changed=false
    if [[ "${next_hash}" != "${last_hash}" ]]; then
      files_changed=true
      last_hash="${next_hash}"
    fi

    # Check for device changes
    local current_devices
    current_devices=$(get_connected_devices | sort | tr '\n' ' ')
    local devices_changed=false
    if [[ "${current_devices}" != "${last_devices}" ]]; then
      devices_changed=true
      if [[ -n "${current_devices}" ]] && [[ -z "${last_devices}" ]]; then
        log_info "Device(s) connected: ${current_devices}"
      elif [[ -z "${current_devices}" ]] && [[ -n "${last_devices}" ]]; then
        log_info "All devices disconnected."
      elif [[ -n "${current_devices}" ]]; then
        log_info "Device list changed: ${current_devices}"
      fi
      last_devices="${current_devices}"
    fi

    # Rebuild if files changed
    if [[ "${files_changed}" == "true" ]]; then
      log_info "Change detected. Rebuilding..."
      if build_apk; then
        apk_needs_install=true
        last_hash="$(hash_watch_state)"
      else
        log_warn "Build failed; waiting for next change."
        continue
      fi
    fi

    # Install if we have a pending APK and devices are available
    if [[ "${apk_needs_install}" == "true" ]] || [[ "${devices_changed}" == "true" ]]; then
      if [[ -n "${current_devices}" ]] && [[ -f "${APK_PATH}" ]]; then
        if install_apk; then
          apk_needs_install=false

          local checksum
          checksum="$(compute_checksum)"
          if [[ -n "${checksum}" ]]; then
            log_info "APK sha256: ${checksum}"
            if [[ "${update_checksum_flag}" == "true" ]]; then
              update_checksum "${checksum}"
            fi
          fi
        else
          log_warn "Install failed; will retry."
        fi
      fi
    fi
  done
}
