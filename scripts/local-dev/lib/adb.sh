#!/usr/bin/env bash
#
# ADB utilities for local development scripts.
#
# Variables (set by functions):
#   ADB_BIN - Path to adb binary (set by resolve_adb)
#
# Functions:
#   resolve_adb()          - Find adb binary, sets ADB_BIN
#   get_connected_devices() - List device IDs with "device" status
#   resolve_device()       - Resolve target device from env/auto-detect

ADB_BIN=""

# Find adb binary and set ADB_BIN
resolve_adb() {
  if command -v adb >/dev/null 2>&1; then
    ADB_BIN="adb"
    return
  fi

  if [[ -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
    ADB_BIN="${ANDROID_HOME}/platform-tools/adb"
    return
  fi

  if [[ -n "${ANDROID_SDK_ROOT:-}" && -x "${ANDROID_SDK_ROOT}/platform-tools/adb" ]]; then
    ADB_BIN="${ANDROID_SDK_ROOT}/platform-tools/adb"
    return
  fi

  log_error "adb not found. Install Android platform-tools or set ANDROID_HOME."
  exit 1
}

# Get list of connected devices with "device" status
get_connected_devices() {
  "${ADB_BIN}" devices | awk 'NR>1 && $2=="device" {print $1}'
}

# Resolve target device from DEVICE_ID, ANDROID_SERIAL, or auto-detect
# Sets DEVICE_ID if a single device is found
# Returns 0 if devices available, 1 if none
resolve_device() {
  if [[ -z "${DEVICE_ID}" && -n "${ANDROID_SERIAL:-}" ]]; then
    DEVICE_ID="${ANDROID_SERIAL}"
  fi

  # If a specific device is set, use it
  if [[ -n "${DEVICE_ID}" ]]; then
    return 0
  fi

  # Otherwise, we'll install to all connected devices dynamically
  local devices
  devices=$(get_connected_devices)
  if [[ -z "${devices}" ]]; then
    log_warn "No adb devices found. Will install when devices connect."
    return 1
  fi

  local count
  count=$(echo "${devices}" | wc -l | tr -d ' ')
  if [[ "${count}" -eq 1 ]]; then
    DEVICE_ID="${devices}"
    log_info "Auto-detected device: ${DEVICE_ID}"
  else
    log_info "Multiple devices found - will install to all connected devices."
  fi
  return 0
}
