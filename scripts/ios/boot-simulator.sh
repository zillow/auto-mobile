#!/usr/bin/env bash
#
# Boot an iOS Simulator
#
# Finds the first available iPhone device for a given iOS version, boots it,
# and waits until it is ready. Prints the booted device UDID to stdout.
#
# Usage:
#   ./scripts/ios/boot-simulator.sh [--ios-version VERSION]
#
# Options:
#   --ios-version VERSION  iOS runtime version to target (default: auto-detect from Xcode SDK)
#
# Outputs:
#   stdout     - UDID of the booted simulator
#   GITHUB_OUTPUT (if set) - simulator_udid=<udid>

set -euo pipefail

IOS_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ios-version)
      IOS_VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Auto-detect iOS version from the active Xcode SDK if not specified
if [[ -z "${IOS_VERSION}" ]]; then
  IOS_VERSION=$(xcrun --sdk iphonesimulator --show-sdk-version 2>/dev/null)
  if [[ -z "${IOS_VERSION}" ]]; then
    echo "error: could not detect iOS SDK version from Xcode" >&2
    exit 1
  fi
fi

echo "Looking for iPhone simulator running iOS ${IOS_VERSION}..." >&2

# Runtime identifier uses dashes: iOS-26-2 not iOS-26.2
RUNTIME_ID="com.apple.CoreSimulator.SimRuntime.iOS-${IOS_VERSION//./-}"

# Find the first available iPhone device for the requested iOS version
UDID=$(xcrun simctl list devices available -j \
  | jq -r --arg runtime "${RUNTIME_ID}" '
      .devices
      | to_entries[]
      | select(.key == $runtime)
      | .value[]
      | select(.name | startswith("iPhone"))
      | .udid
    ' \
  | head -1)

# If no device exists for this runtime, create one
if [[ -z "${UDID}" ]]; then
  echo "No existing iPhone device for iOS ${IOS_VERSION}, creating one..." >&2
  DEVICE_TYPE=$(xcrun simctl list devicetypes -j \
    | jq -r '.devicetypes[] | select(.name | startswith("iPhone")) | .identifier' \
    | tail -1)
  if [[ -z "${DEVICE_TYPE}" ]]; then
    echo "error: no iPhone device type found to create simulator" >&2
    exit 1
  fi
  echo "Creating device: ${DEVICE_TYPE} with runtime ${RUNTIME_ID}" >&2
  UDID=$(xcrun simctl create "CI iPhone" "${DEVICE_TYPE}" "${RUNTIME_ID}")
fi

if [[ -z "${UDID}" ]]; then
  echo "error: no available iPhone simulator found for iOS ${IOS_VERSION}" >&2
  echo "Available runtimes:" >&2
  xcrun simctl list runtimes 2>/dev/null | grep iOS >&2 || true
  exit 1
fi

DEVICE_NAME=$(xcrun simctl list devices available -j \
  | jq -r --arg udid "${UDID}" '
      .devices | to_entries[] | .value[]
      | select(.udid == $udid) | .name
    ')

echo "Booting ${DEVICE_NAME} (${UDID})..." >&2
xcrun simctl boot "${UDID}"
xcrun simctl bootstatus "${UDID}" -b >&2

echo "Booted: ${DEVICE_NAME} (${UDID})" >&2

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "simulator_udid=${UDID}" >> "${GITHUB_OUTPUT}"
fi

echo "${UDID}"
