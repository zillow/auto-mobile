#!/usr/bin/env bash
# Validate that the slim Docker image can use host-installed emulators via MCP.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

IMAGE_NAME="${IMAGE_NAME:-auto-mobile:latest}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
MCP_PROTOCOL_VERSION="${MCP_PROTOCOL_VERSION:-2024-11-05}"
MCP_RESPONSE_TIMEOUT="${MCP_RESPONSE_TIMEOUT:-600}"
HOST_ANDROID_SDK="${HOST_ANDROID_SDK:-}"
HOST_ANDROID_SDK_MOUNT_MODE="${HOST_ANDROID_SDK_MOUNT_MODE:-rw}"
AUTOMOBILE_EMULATOR_HEADLESS="${AUTOMOBILE_EMULATOR_HEADLESS:-true}"
AUTOMOBILE_EMULATOR_ARGS="${AUTOMOBILE_EMULATOR_ARGS:-}"
FORCE_DOCKER_BUILD="${FORCE_DOCKER_BUILD:-false}"
HOST_EMULATOR_ARGS="${HOST_EMULATOR_ARGS:-}"
HOST_EMULATOR_CONSOLE_PORT="${HOST_EMULATOR_CONSOLE_PORT:-5554}"
HOST_EMULATOR_ADB_PORT="${HOST_EMULATOR_ADB_PORT:-}"
HOST_GATEWAY="${HOST_GATEWAY:-host.docker.internal}"
CONTAINER_DEVICE_ID=""
STARTED_HOST_EMULATOR="false"
ACTIVE_DEVICE_ID=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONTAINER_NAME="auto-mobile-host-emulator-test-$$"
PIPE_DIR=""
MCP_INPUT_PIPE=""
MCP_OUTPUT_PIPE=""

cleanup() {
  echo -e "${YELLOW}Cleaning up test container...${NC}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  if [[ -n "${MCP_PID:-}" ]]; then
    kill "${MCP_PID}" >/dev/null 2>&1 || true
    wait "${MCP_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${STARTED_HOST_EMULATOR}" == "true" && -n "${HOST_EMULATOR_PID:-}" ]]; then
    kill "${HOST_EMULATOR_PID}" >/dev/null 2>&1 || true
  fi
  exec 3>&- || true
  exec 4>&- || true
  if [[ -n "${PIPE_DIR}" ]]; then
    rm -rf "${PIPE_DIR}" || true
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}Missing required command: $1${NC}" >&2
    exit 1
  fi
}

encode_uri_component() {
  jq -nr --arg value "$1" '$value|@uri'
}

detect_host_sdk() {
  if [[ -n "${HOST_ANDROID_SDK}" ]]; then
    echo "${HOST_ANDROID_SDK}"
    return 0
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
    echo "${ANDROID_SDK_ROOT}"
    return 0
  fi
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
    echo "${ANDROID_HOME}"
    return 0
  fi
  if [[ -d "${HOME}/Library/Android/sdk" ]]; then
    echo "${HOME}/Library/Android/sdk"
    return 0
  fi
  if [[ -d "${HOME}/Android/Sdk" ]]; then
    echo "${HOME}/Android/Sdk"
    return 0
  fi
  return 1
}

require_command docker
require_command jq

HOST_OS="$(uname -s)"
IS_LINUX="false"
IS_DARWIN="false"
if [[ "${HOST_OS}" == "Linux" ]]; then
  IS_LINUX="true"
elif [[ "${HOST_OS}" == "Darwin" ]]; then
  IS_DARWIN="true"
else
  echo -e "${RED}Unsupported host OS: ${HOST_OS}.${NC}" >&2
  exit 1
fi

if [[ -z "${HOST_EMULATOR_ADB_PORT}" ]]; then
  HOST_EMULATOR_ADB_PORT="$((HOST_EMULATOR_CONSOLE_PORT + 1))"
fi

HOST_ANDROID_SDK="$(detect_host_sdk || true)"

HOST_ADB_BIN=""
if [[ -n "${HOST_ANDROID_SDK}" && -x "${HOST_ANDROID_SDK}/platform-tools/adb" ]]; then
  HOST_ADB_BIN="${HOST_ANDROID_SDK}/platform-tools/adb"
elif command -v adb >/dev/null 2>&1; then
  HOST_ADB_BIN="$(command -v adb)"
fi

HOST_EMULATOR_BIN=""
if [[ -n "${HOST_ANDROID_SDK}" && -x "${HOST_ANDROID_SDK}/emulator/emulator" ]]; then
  HOST_EMULATOR_BIN="${HOST_ANDROID_SDK}/emulator/emulator"
elif command -v emulator >/dev/null 2>&1; then
  HOST_EMULATOR_BIN="$(command -v emulator)"
fi

if [[ ! -d "${HOME}/.android/avd" ]]; then
  echo -e "${RED}No AVDs found at ${HOME}/.android/avd.${NC}" >&2
  echo -e "${YELLOW}Create one with: avdmanager create avd ...${NC}" >&2
  exit 1
fi

if ! ls "${HOME}/.android/avd"/*.ini >/dev/null 2>&1; then
  echo -e "${RED}No AVD definitions (*.ini) found in ${HOME}/.android/avd.${NC}" >&2
  exit 1
fi

if [[ "${IS_LINUX}" == "true" && ( -z "${HOST_ANDROID_SDK}" || ! -d "${HOST_ANDROID_SDK}" ) ]]; then
  echo -e "${RED}Android SDK not found. Set HOST_ANDROID_SDK or ANDROID_SDK_ROOT.${NC}" >&2
  exit 1
fi

if [[ "${IS_LINUX}" == "true" && ! -x "${HOST_ANDROID_SDK}/emulator/emulator" ]]; then
  echo -e "${RED}Emulator binary not found at ${HOST_ANDROID_SDK}/emulator/emulator.${NC}" >&2
  echo -e "${YELLOW}Install it with: sdkmanager --install emulator${NC}" >&2
  exit 1
fi

if [[ "${IS_DARWIN}" == "true" && -z "${HOST_EMULATOR_BIN}" ]]; then
  echo -e "${RED}Host emulator binary not found. Install Android Emulator via Android Studio or SDK Manager.${NC}" >&2
  exit 1
fi

image_missing="false"
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  image_missing="true"
fi

if [[ "${FORCE_DOCKER_BUILD}" == "true" || "${image_missing}" == "true" ]]; then
  if [[ "${image_missing}" == "true" ]]; then
    echo -e "${YELLOW}Image ${IMAGE_NAME} not found; building without emulator...${NC}"
  else
    echo -e "${YELLOW}Rebuilding image ${IMAGE_NAME} without emulator...${NC}"
  fi
  docker build --platform "${DOCKER_PLATFORM}" \
    --build-arg ANDROID_INSTALL_EMULATOR=false \
    -t "${IMAGE_NAME}" \
    "${PROJECT_ROOT}"
else
  image_id="$(docker image inspect --format '{{.Id}}' "${IMAGE_NAME}" 2>/dev/null || true)"
  image_created="$(docker image inspect --format '{{.Created}}' "${IMAGE_NAME}" 2>/dev/null || true)"
  echo -e "${GREEN}Using existing image ${IMAGE_NAME}${NC} ${image_id} ${image_created}"
fi

echo -e "${GREEN}Starting MCP server container: ${IMAGE_NAME}${NC}"

PIPE_DIR="$(mktemp -d)"
MCP_INPUT_PIPE="${PIPE_DIR}/mcp_in"
MCP_OUTPUT_PIPE="${PIPE_DIR}/mcp_out"
mkfifo "${MCP_INPUT_PIPE}" "${MCP_OUTPUT_PIPE}"
exec 3<> "${MCP_INPUT_PIPE}"
exec 4<> "${MCP_OUTPUT_PIPE}"

docker_args=(--platform "${DOCKER_PLATFORM}" -i --rm --name "${CONTAINER_NAME}")
if [[ "${IS_LINUX}" == "true" ]]; then
  docker_args+=(--network host)
  docker_args+=(-v "${HOST_ANDROID_SDK}:/opt/android-sdk:${HOST_ANDROID_SDK_MOUNT_MODE}")
fi
docker_args+=(
  -e ANDROID_HOME=/opt/android-sdk
  -e ANDROID_SDK_ROOT=/opt/android-sdk
  -e AUTOMOBILE_EMULATOR_HEADLESS="${AUTOMOBILE_EMULATOR_HEADLESS}"
)
if [[ -n "${AUTOMOBILE_EMULATOR_ARGS}" ]]; then
  docker_args+=(-e "AUTOMOBILE_EMULATOR_ARGS=${AUTOMOBILE_EMULATOR_ARGS}")
fi
if [[ "${IS_DARWIN}" == "true" ]]; then
  docker_args+=(-e "AUTOMOBILE_EMULATOR_EXTERNAL=true")
fi
docker_args+=(
  -v "${HOME}/.android:/home/automobile/.android:rw"
  -v "${HOME}/.auto-mobile:/home/automobile/.auto-mobile:rw"
  "${IMAGE_NAME}"
)

docker run "${docker_args[@]}" < "${MCP_INPUT_PIPE}" > "${MCP_OUTPUT_PIPE}" 2>&1 &
MCP_PID=$!

send_request() {
  printf '%s\n' "$1" >&3
}

read_for_id() {
  local target_id="$1"
  local start_time="${SECONDS}"
  local line

  while true; do
    if IFS= read -r -t 1 -u 4 line; then
      if [[ -z "${line}" ]]; then
        continue
      fi
      if ! echo "${line}" | jq -e . >/dev/null 2>&1; then
        echo -e "${YELLOW}Ignoring non-JSON output: ${line}${NC}" >&2
        continue
      fi
      local id
      id="$(echo "${line}" | jq -r '.id // empty')"
      if [[ "${id}" == "${target_id}" ]]; then
        echo "${line}"
        return 0
      fi
      if echo "${line}" | jq -e '.method == "progress"' >/dev/null 2>&1; then
        local msg
        msg="$(echo "${line}" | jq -r '.params.message // empty')"
        if [[ -n "${msg}" ]]; then
          echo -e "${YELLOW}progress: ${msg}${NC}" >&2
        fi
      fi
    else
      if (( SECONDS - start_time > MCP_RESPONSE_TIMEOUT )); then
        echo -e "${RED}Timed out waiting for response id ${target_id}.${NC}" >&2
        return 1
      fi
    fi
  done
}

LAST_RESOURCE_ERROR_MESSAGE=""
LAST_RESOURCE_RESPONSE=""

read_resource_text() {
  local uri="$1"
  local request_id="$2"
  local request
  request=$(jq -c -n --arg uri "${uri}" \
    '{"jsonrpc":"2.0","id":'"${request_id}"',"method":"resources/read","params":{"uri":$uri}}')
  send_request "${request}"
  local response
  response="$(read_for_id "${request_id}")"

  LAST_RESOURCE_RESPONSE="${response}"
  LAST_RESOURCE_ERROR_MESSAGE="$(echo "${response}" | jq -r '.error.message // empty')"

  if echo "${response}" | jq -e '.error' >/dev/null 2>&1; then
    return 1
  fi

  local payload
  payload="$(echo "${response}" | jq -r '.result.contents[0].text')"
  if [[ -z "${payload}" || "${payload}" == "null" ]]; then
    return 1
  fi
  if echo "${payload}" | jq -e '.error' >/dev/null 2>&1; then
    LAST_RESOURCE_ERROR_MESSAGE="resource payload error"
    return 1
  fi

  echo "${payload}"
  return 0
}

start_host_emulator() {
  local avd="$1"
  local log_file
  local args=("-avd" "${avd}" "-port" "${HOST_EMULATOR_CONSOLE_PORT}")
  if [[ "${AUTOMOBILE_EMULATOR_HEADLESS}" == "true" ]]; then
    args+=("-no-window" "-no-audio")
  fi
  if [[ -n "${HOST_EMULATOR_ARGS}" ]]; then
    local host_args=()
    read -r -a host_args <<< "${HOST_EMULATOR_ARGS}"
    args+=("${host_args[@]}")
  fi

  log_file="$(mktemp)"
  "${HOST_EMULATOR_BIN}" "${args[@]}" >"${log_file}" 2>&1 &
  HOST_EMULATOR_PID=$!

  sleep 2
  if ! kill -0 "${HOST_EMULATOR_PID}" >/dev/null 2>&1; then
    if grep -q "Running multiple emulators with the same AVD" "${log_file}"; then
      echo -e "${YELLOW}Host emulator already running; continuing.${NC}"
      STARTED_HOST_EMULATOR="false"
      return 0
    fi
    echo -e "${RED}Host emulator failed to start. Log: ${log_file}${NC}" >&2
    tail -n 40 "${log_file}" >&2 || true
    return 1
  fi
  STARTED_HOST_EMULATOR="true"
  return 0
}

find_running_emulator_for_avd() {
  local avd="$1"
  if [[ -z "${HOST_ADB_BIN}" ]]; then
    return 1
  fi

  local serials
  serials="$("${HOST_ADB_BIN}" devices | awk 'NR>1 {print $1}' | grep '^emulator-' || true)"
  if [[ -z "${serials}" ]]; then
    return 1
  fi

  local serial
  while read -r serial; do
    if [[ -z "${serial}" ]]; then
      continue
    fi
    local name
    name="$("${HOST_ADB_BIN}" -s "${serial}" emu avd name 2>/dev/null | head -1 | tr -d '\r')"
    if [[ "${name}" == "${avd}" ]]; then
      echo "${serial}"
      return 0
    fi
  done <<< "${serials}"

  return 1
}

derive_ports_from_serial() {
  local serial="$1"
  local console_port="${serial#emulator-}"
  if [[ -n "${console_port}" && "${console_port}" =~ ^[0-9]+$ ]]; then
    HOST_EMULATOR_CONSOLE_PORT="${console_port}"
    HOST_EMULATOR_ADB_PORT="$((console_port + 1))"
  fi
}

connect_container_to_emulator() {
  local target="$1"
  local attempts=30
  local delay=2

  for ((i=1; i<=attempts; i++)); do
    if docker exec --user automobile "${CONTAINER_NAME}" adb connect "${target}" >/dev/null 2>&1; then
      if docker exec --user automobile "${CONTAINER_NAME}" adb devices | grep -q "${target}"; then
        echo -e "${GREEN}Connected container ADB to ${target}${NC}"
        return 0
      fi
    fi
    sleep "${delay}"
  done

  echo -e "${RED}Failed to connect container ADB to ${target}.${NC}" >&2
  return 1
}

wait_for_container_device() {
  local device_id="$1"
  local attempts=60
  local delay=2

  for ((i=1; i<=attempts; i++)); do
    if docker exec --user automobile "${CONTAINER_NAME}" adb -s "${device_id}" get-state >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done

  echo -e "${RED}Device ${device_id} did not become ready in time.${NC}" >&2
  return 1
}

read_booted_devices_resource() {
  local uri="automobile:devices/booted/android"
  local request
  request=$(jq -c -n --arg uri "${uri}" \
    '{"jsonrpc":"2.0","id":10,"method":"resources/read","params":{"uri":$uri}}')
  send_request "${request}"
  local response
  response="$(read_for_id 10)"

  if echo "${response}" | jq -e '.error' >/dev/null 2>&1; then
    echo -e "${RED}booted devices resource read failed:${NC}" >&2
    echo "${response}" | jq . >&2
    return 1
  fi

  local payload
  payload="$(echo "${response}" | jq -r '.result.contents[0].text')"
  if [[ -z "${payload}" || "${payload}" == "null" ]]; then
    echo -e "${RED}booted devices resource did not return any content.${NC}" >&2
    echo "${response}" | jq . >&2
    return 1
  fi
  if echo "${payload}" | jq -e '.error' >/dev/null 2>&1; then
    echo -e "${RED}booted devices resource returned an error:${NC}" >&2
    echo "${payload}" | jq . >&2
    return 1
  fi

  echo "${payload}"
}

wait_for_booted_device() {
  local attempts=6
  local delay=4
  local payload
  local device_id

  for ((i=1; i<=attempts; i++)); do
    payload="$(read_booted_devices_resource)" || true
    device_id="$(echo "${payload:-}" | jq -r '.devices[0].deviceId // empty')"
    if [[ -n "${device_id}" ]]; then
      echo "${device_id}"
      return 0
    fi

    if [[ "${i}" -lt "${attempts}" ]]; then
      echo -e "${YELLOW}No booted devices reported yet; retrying in ${delay}s...${NC}" >&2
      sleep "${delay}"
    fi
  done

  echo -e "${RED}No booted devices reported by MCP after waiting.${NC}" >&2
  return 1
}

sanitize_device_id() {
  local input="$1"
  local cleaned
  local device_id=""
  cleaned="$(printf '%s' "${input}" | sed -E 's/\x1B\[[0-9;]*m//g')"

  while IFS= read -r line; do
    line="${line//$'\r'/}"
    if [[ "${line}" =~ ^emulator-[0-9]+$ || "${line}" =~ ^[A-Za-z0-9._-]+:[0-9]+$ ]]; then
      device_id="${line}"
    fi
  done <<< "${cleaned}"

  printf '%s' "${device_id}"
}

set_active_device() {
  local device_id="$1"
  local attempts=3
  local delay=6
  local response
  local error_msg

  for ((i=1; i<=attempts; i++)); do
    local set_active_request
    set_active_request=$(jq -c -n \
      --arg deviceId "${device_id}" \
      --arg platform "android" \
      '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"setActiveDevice","arguments":{"deviceId":$deviceId,"platform":$platform}}}')
    send_request "${set_active_request}"
    response="$(read_for_id 5)"

    if ! echo "${response}" | jq -e '.error' >/dev/null 2>&1; then
      echo -e "${GREEN}Active device set: ${device_id}${NC}"
      return 0
    fi

    error_msg="$(echo "${response}" | jq -r '.error.message // empty')"
    if [[ "${i}" -lt "${attempts}" ]] && [[ "${error_msg}" == *"not found"* || "${error_msg}" == *"Available android devices: none"* ]]; then
      echo -e "${YELLOW}Active device not visible yet; retrying in ${delay}s...${NC}" >&2
      sleep "${delay}"
      continue
    fi

    echo -e "${RED}setActiveDevice failed:${NC}" >&2
    echo "${response}" | jq . >&2
    return 1
  done

  return 1
}

init_request=$(jq -c -n \
  --arg version "${MCP_PROTOCOL_VERSION}" \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":$version,"capabilities":{},"clientInfo":{"name":"docker-host-emulator-test","version":"1.0.0"}}}')
send_request "${init_request}"
read_for_id 1 >/dev/null

list_request=$(jq -c -n \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"listDeviceImages","arguments":{"platform":"android"}}}')
send_request "${list_request}"
list_response="$(read_for_id 2)"

if echo "${list_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${RED}listDeviceImages failed:${NC}" >&2
  echo "${list_response}" | jq . >&2
  exit 1
fi

list_payload="$(echo "${list_response}" | jq -r '.result.content[0].text')"
avd_name="$(echo "${list_payload}" | jq -r '.images[0].name // empty')"

if [[ -z "${avd_name}" || "${avd_name}" == "null" ]]; then
  echo -e "${RED}No AVDs returned by listDeviceImages.${NC}" >&2
  echo "${list_payload}" | jq . >&2
  exit 1
fi

echo -e "${GREEN}Selected AVD: ${avd_name}${NC}"

if [[ "${IS_DARWIN}" == "true" ]]; then
  running_serial="$(find_running_emulator_for_avd "${avd_name}" || true)"
  if [[ -n "${running_serial}" ]]; then
    echo -e "${GREEN}Found running host emulator: ${running_serial}${NC}"
    derive_ports_from_serial "${running_serial}"
  else
    echo -e "${YELLOW}Starting host emulator for AVD ${avd_name}...${NC}"
    start_host_emulator "${avd_name}"
  fi
  connect_container_to_emulator "${HOST_GATEWAY}:${HOST_EMULATOR_ADB_PORT}"
  CONTAINER_DEVICE_ID="${HOST_GATEWAY}:${HOST_EMULATOR_ADB_PORT}"
  wait_for_container_device "${CONTAINER_DEVICE_ID}"
  raw_device_id="$(wait_for_booted_device || true)"
  ACTIVE_DEVICE_ID="$(sanitize_device_id "${raw_device_id}")"
  if [[ -z "${ACTIVE_DEVICE_ID}" ]]; then
    ACTIVE_DEVICE_ID="${CONTAINER_DEVICE_ID}"
  fi
fi

if [[ "${IS_DARWIN}" == "true" ]]; then
  echo -e "${GREEN}Using emulator via ADB: ${CONTAINER_DEVICE_ID}${NC}"
else
  start_request=$(jq -c -n \
    --arg name "${avd_name}" \
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"startDevice","arguments":{"device":{"name":$name,"platform":"android"}}}}')
  send_request "${start_request}"

  start_response="$(read_for_id 3)"

  if echo "${start_response}" | jq -e '.error' >/dev/null 2>&1; then
    echo -e "${RED}startDevice failed:${NC}" >&2
    echo "${start_response}" | jq . >&2
    exit 1
  fi

  start_payload="$(echo "${start_response}" | jq -r '.result.content[0].text')"
  device_id="$(echo "${start_payload}" | jq -r '.deviceId // empty')"

  if [[ -z "${device_id}" || "${device_id}" == "null" ]]; then
    echo -e "${RED}startDevice did not return a deviceId.${NC}" >&2
    echo "${start_payload}" | jq . >&2
    exit 1
  fi

  ACTIVE_DEVICE_ID="${device_id}"
  echo -e "${GREEN}Emulator running: ${device_id}${NC}"
fi

if [[ -z "${ACTIVE_DEVICE_ID}" ]]; then
  echo -e "${RED}No active device ID available.${NC}" >&2
  exit 1
fi

set_active_device "${ACTIVE_DEVICE_ID}"

apps_payload=""
apps_uri_raw="automobile:apps?deviceId=${ACTIVE_DEVICE_ID}&platform=android"
if ! apps_payload="$(read_resource_text "${apps_uri_raw}" 6)"; then
  apps_uri_encoded="automobile:apps?deviceId=$(encode_uri_component "${ACTIVE_DEVICE_ID}")&platform=android"
  if ! apps_payload="$(read_resource_text "${apps_uri_encoded}" 11)"; then
    if [[ "${LAST_RESOURCE_ERROR_MESSAGE}" == *"Resource not found"* ]]; then
      fallback_uri_raw="automobile:devices/${ACTIVE_DEVICE_ID}/apps"
      if ! apps_payload="$(read_resource_text "${fallback_uri_raw}" 12)"; then
        fallback_uri_encoded="automobile:devices/$(encode_uri_component "${ACTIVE_DEVICE_ID}")/apps"
        if ! apps_payload="$(read_resource_text "${fallback_uri_encoded}" 13)"; then
          echo -e "${RED}apps resource read failed:${NC}" >&2
          echo "${LAST_RESOURCE_RESPONSE}" | jq . >&2
          echo -e "${YELLOW}Apps resources are missing. Rebuild the image with FORCE_DOCKER_BUILD=true.${NC}" >&2
          exit 1
        fi
      fi
    else
      echo -e "${RED}apps resource read failed:${NC}" >&2
      echo "${LAST_RESOURCE_RESPONSE}" | jq . >&2
      exit 1
    fi
  fi
fi

clock_app_id="$(echo "${apps_payload}" | jq -r '
  def packages:
    if has("apps") then .apps
    elif has("devices") and (.devices | length > 0) then .devices[0].apps
    else [] end
    | map(.packageName);
  (packages | map(select(. == "com.android.deskclock" or . == "com.google.android.deskclock")) | .[0])
  // (packages | map(select(test("deskclock"; "i"))) | .[0])
  // (packages | map(select(test("clock"; "i"))) | .[0])
  // empty
')"

if [[ -z "${clock_app_id}" || "${clock_app_id}" == "null" ]]; then
  echo -e "${YELLOW}Clock app not found in apps resource; falling back to default package names.${NC}" >&2
  clock_app_id="com.android.deskclock"
fi

echo -e "${GREEN}Clock app package: ${clock_app_id}${NC}"

observe_request=$(jq -c -n \
  --arg platform "android" \
  '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"observe","arguments":{"platform":$platform}}}')
send_request "${observe_request}"
observe_response="$(read_for_id 7)"

if echo "${observe_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${RED}observe failed:${NC}" >&2
  echo "${observe_response}" | jq . >&2
  exit 1
fi

echo -e "${GREEN}observe succeeded.${NC}"

launch_request=$(jq -c -n \
  --arg appId "${clock_app_id}" \
  '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"launchApp","arguments":{"appId":$appId}}}')
send_request "${launch_request}"
launch_response="$(read_for_id 8)"

if echo "${launch_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${RED}launchApp failed:${NC}" >&2
  echo "${launch_response}" | jq . >&2
  exit 1
fi

echo -e "${GREEN}Clock app launched.${NC}"

terminate_request=$(jq -c -n \
  --arg appId "${clock_app_id}" \
  '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"terminateApp","arguments":{"appId":$appId}}}')
send_request "${terminate_request}"
terminate_response="$(read_for_id 9)"

if echo "${terminate_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${RED}terminateApp failed:${NC}" >&2
  echo "${terminate_response}" | jq . >&2
  exit 1
fi

echo -e "${GREEN}Clock app terminated.${NC}"

if [[ "${IS_DARWIN}" == "true" ]]; then
  if [[ "${STARTED_HOST_EMULATOR}" == "true" ]]; then
    kill_request=$(jq -c -n \
      --arg name "${avd_name}" \
      --arg deviceId "${CONTAINER_DEVICE_ID}" \
      '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"killDevice","arguments":{"device":{"name":$name,"deviceId":$deviceId,"platform":"android"}}}}')
    send_request "${kill_request}"
    kill_response="$(read_for_id 4)"

    if echo "${kill_response}" | jq -e '.error' >/dev/null 2>&1; then
      echo -e "${RED}killDevice failed:${NC}" >&2
      echo "${kill_response}" | jq . >&2
      exit 1
    fi

    echo -e "${GREEN}Emulator stopped successfully.${NC}"
  else
    echo -e "${YELLOW}Leaving existing emulator running.${NC}"
  fi
else
  kill_request=$(jq -c -n \
    --arg name "${avd_name}" \
    --arg deviceId "${device_id}" \
    '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"killDevice","arguments":{"device":{"name":$name,"deviceId":$deviceId,"platform":"android"}}}}')
  send_request "${kill_request}"
  kill_response="$(read_for_id 4)"

  if echo "${kill_response}" | jq -e '.error' >/dev/null 2>&1; then
    echo -e "${RED}killDevice failed:${NC}" >&2
    echo "${kill_response}" | jq . >&2
    exit 1
  fi

  echo -e "${GREEN}Emulator stopped successfully.${NC}"
fi
