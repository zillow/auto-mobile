#!/usr/bin/env bash
# Validate that the Docker image can control iOS simulators via the host control daemon.
# This test requires macOS with Xcode installed.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

IMAGE_NAME="${IMAGE_NAME:-auto-mobile:latest}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
MCP_PROTOCOL_VERSION="${MCP_PROTOCOL_VERSION:-2024-11-05}"
MCP_RESPONSE_TIMEOUT="${MCP_RESPONSE_TIMEOUT:-120}"
HOST_GATEWAY="${HOST_GATEWAY:-host.docker.internal}"
HOST_CONTROL_PORT="${HOST_CONTROL_PORT:-15037}"
FORCE_DOCKER_BUILD="${FORCE_DOCKER_BUILD:-false}"
BOOT_SIMULATOR="${BOOT_SIMULATOR:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONTAINER_NAME="auto-mobile-host-simulator-test-$$"
PIPE_DIR=""
MCP_INPUT_PIPE=""
MCP_OUTPUT_PIPE=""
DAEMON_PID=""
STARTED_DAEMON="false"
BOOTED_SIMULATOR_UDID=""

cleanup() {
  echo -e "${YELLOW}Cleaning up...${NC}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  if [[ -n "${MCP_PID:-}" ]]; then
    kill "${MCP_PID}" >/dev/null 2>&1 || true
    wait "${MCP_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${STARTED_DAEMON}" == "true" && -n "${DAEMON_PID}" ]]; then
    echo -e "${YELLOW}Stopping host control daemon...${NC}"
    kill "${DAEMON_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BOOTED_SIMULATOR_UDID}" ]]; then
    echo -e "${YELLOW}Shutting down simulator ${BOOTED_SIMULATOR_UDID}...${NC}"
    xcrun simctl shutdown "${BOOTED_SIMULATOR_UDID}" >/dev/null 2>&1 || true
  fi
  exec 3>&- 2>/dev/null || true
  exec 4>&- 2>/dev/null || true
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

# Check requirements
require_command docker
require_command jq
require_command node

# macOS only
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo -e "${RED}This test requires macOS with Xcode installed.${NC}" >&2
  exit 1
fi

# Check for Xcode
if ! command -v xcrun >/dev/null 2>&1; then
  echo -e "${RED}Xcode command line tools not found. Install with: xcode-select --install${NC}" >&2
  exit 1
fi

# Check for simulators
if ! xcrun simctl list devices --json >/dev/null 2>&1; then
  echo -e "${RED}Cannot list iOS simulators. Ensure Xcode is properly installed.${NC}" >&2
  exit 1
fi

# Check if Docker image exists
image_missing="false"
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  image_missing="true"
fi

if [[ "${FORCE_DOCKER_BUILD}" == "true" || "${image_missing}" == "true" ]]; then
  if [[ "${image_missing}" == "true" ]]; then
    echo -e "${YELLOW}Image ${IMAGE_NAME} not found; building...${NC}"
  else
    echo -e "${YELLOW}Rebuilding image ${IMAGE_NAME}...${NC}"
  fi
  docker build --platform "${DOCKER_PLATFORM}" \
    --build-arg ANDROID_INSTALL_EMULATOR=false \
    -t "${IMAGE_NAME}" \
    "${PROJECT_ROOT}"
else
  image_id="$(docker image inspect --format '{{.Id}}' "${IMAGE_NAME}" 2>/dev/null || true)"
  echo -e "${GREEN}Using existing image ${IMAGE_NAME}${NC} ${image_id}"
fi

# Check if host control daemon is already running
if nc -z localhost "${HOST_CONTROL_PORT}" 2>/dev/null; then
  echo -e "${GREEN}Host control daemon already running on port ${HOST_CONTROL_PORT}${NC}"
else
  echo -e "${YELLOW}Starting host control daemon...${NC}"
  node "${SCRIPT_DIR}/host-control-daemon.js" --port "${HOST_CONTROL_PORT}" &
  DAEMON_PID=$!
  STARTED_DAEMON="true"
  sleep 2

  if ! nc -z localhost "${HOST_CONTROL_PORT}" 2>/dev/null; then
    echo -e "${RED}Failed to start host control daemon${NC}" >&2
    exit 1
  fi
  echo -e "${GREEN}Host control daemon started on port ${HOST_CONTROL_PORT}${NC}"
fi

# Test daemon iOS commands directly first
echo -e "${GREEN}Testing host control daemon iOS commands...${NC}"

test_daemon_command() {
  local method="$1"
  local params="${2:-{}}"
  local request
  request=$(jq -c -n --arg method "${method}" --argjson params "${params}" \
    '{"jsonrpc":"2.0","id":1,"method":$method,"params":$params}')

  node -e "
const net = require('net');
const client = new net.Socket();
client.connect(${HOST_CONTROL_PORT}, 'localhost', () => {
  client.write('${request}\n');
});
let buffer = '';
client.on('data', (data) => {
  buffer += data.toString();
  if (buffer.includes('\n')) {
    console.log(buffer.trim());
    client.destroy();
  }
});
client.setTimeout(10000, () => {
  console.log('{\"error\":\"timeout\"}');
  client.destroy();
});
client.on('error', (err) => {
  console.log(JSON.stringify({error: err.message}));
});
"
}

# Test ping
ping_result=$(test_daemon_command "ping")
if echo "${ping_result}" | jq -e '.result.isMacOS == true' >/dev/null 2>&1; then
  echo -e "${GREEN}  ping: OK (macOS detected)${NC}"
else
  echo -e "${RED}  ping: FAILED${NC}" >&2
  echo "${ping_result}" >&2
  exit 1
fi

# Test ios-info
ios_info_result=$(test_daemon_command "ios-info")
if echo "${ios_info_result}" | jq -e '.result.success == true' >/dev/null 2>&1; then
  xcode_version=$(echo "${ios_info_result}" | jq -r '.result.xcodeVersion // "unknown"' | head -1)
  echo -e "${GREEN}  ios-info: OK (Xcode: ${xcode_version})${NC}"
else
  echo -e "${RED}  ios-info: FAILED${NC}" >&2
  echo "${ios_info_result}" >&2
  exit 1
fi

# Test list-simulators
simulators_result=$(test_daemon_command "list-simulators")
simulator_count=$(echo "${simulators_result}" | jq -r '.result.simulators | length')
if [[ "${simulator_count}" -gt 0 ]]; then
  echo -e "${GREEN}  list-simulators: OK (${simulator_count} simulators available)${NC}"
else
  echo -e "${RED}  list-simulators: FAILED (no simulators found)${NC}" >&2
  exit 1
fi

# First check for already running simulators
running_result=$(test_daemon_command "list-running-simulators")
running_count=$(echo "${running_result}" | jq -r '.result.simulators | length // 0')

if [[ "${running_count}" -gt 0 ]]; then
  # Prefer a running iPhone simulator
  first_simulator=$(echo "${running_result}" | jq -r '.result.simulators | map(select(.name | contains("iPhone"))) | .[0] // .result.simulators[0]')
  if [[ "${first_simulator}" != "null" && -n "${first_simulator}" ]]; then
    simulator_udid=$(echo "${first_simulator}" | jq -r '.udid')
    simulator_name=$(echo "${first_simulator}" | jq -r '.name')
    simulator_state=$(echo "${first_simulator}" | jq -r '.state')
    echo -e "${GREEN}Found running simulator: ${simulator_name} (${simulator_udid}) - ${simulator_state}${NC}"
  else
    # No running iPhone, use first running simulator
    first_simulator=$(echo "${running_result}" | jq -r '.result.simulators[0]')
    simulator_udid=$(echo "${first_simulator}" | jq -r '.udid')
    simulator_name=$(echo "${first_simulator}" | jq -r '.name')
    simulator_state=$(echo "${first_simulator}" | jq -r '.state')
    echo -e "${GREEN}Found running simulator: ${simulator_name} (${simulator_udid}) - ${simulator_state}${NC}"
  fi
else
  # No running simulators, get first available iPhone simulator
  first_simulator=$(echo "${simulators_result}" | jq -r '.result.simulators | map(select(.name | contains("iPhone"))) | .[0]')
  simulator_udid=$(echo "${first_simulator}" | jq -r '.udid')
  simulator_name=$(echo "${first_simulator}" | jq -r '.name')
  simulator_state=$(echo "${first_simulator}" | jq -r '.state')

  echo -e "${YELLOW}No running simulators. Selected: ${simulator_name} (${simulator_udid}) - ${simulator_state}${NC}"

  # Optionally boot the simulator
  if [[ "${BOOT_SIMULATOR}" == "true" && "${simulator_state}" == "Shutdown" ]]; then
    echo -e "${YELLOW}Booting simulator ${simulator_name}...${NC}"
    boot_result=$(test_daemon_command "boot-simulator" "{\"udid\":\"${simulator_udid}\"}")
    if echo "${boot_result}" | jq -e '.result.success == true' >/dev/null 2>&1; then
      echo -e "${GREEN}  boot-simulator: OK${NC}"
      BOOTED_SIMULATOR_UDID="${simulator_udid}"
      # Wait for boot
      sleep 5
    else
      echo -e "${RED}  boot-simulator: FAILED${NC}" >&2
      echo "${boot_result}" >&2
    fi
  fi
fi

# Now test via Docker container MCP
echo ""
echo -e "${GREEN}Testing iOS control via Docker MCP...${NC}"

PIPE_DIR="$(mktemp -d)"
MCP_INPUT_PIPE="${PIPE_DIR}/mcp_in"
MCP_OUTPUT_PIPE="${PIPE_DIR}/mcp_out"
mkfifo "${MCP_INPUT_PIPE}" "${MCP_OUTPUT_PIPE}"
exec 3<> "${MCP_INPUT_PIPE}"
exec 4<> "${MCP_OUTPUT_PIPE}"

docker_args=(
  --platform "${DOCKER_PLATFORM}"
  -i --rm
  --name "${CONTAINER_NAME}"
  -e "AUTOMOBILE_EMULATOR_EXTERNAL=true"
  -e "AUTOMOBILE_HOST_CONTROL_HOST=${HOST_GATEWAY}"
  -e "AUTOMOBILE_HOST_CONTROL_PORT=${HOST_CONTROL_PORT}"
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
        echo -e "${YELLOW}Ignoring non-JSON: ${line:0:100}...${NC}" >&2
        continue
      fi
      local id
      id="$(echo "${line}" | jq -r '.id // empty')"
      if [[ "${id}" == "${target_id}" ]]; then
        echo "${line}"
        return 0
      fi
    else
      if (( SECONDS - start_time > MCP_RESPONSE_TIMEOUT )); then
        echo -e "${RED}Timeout waiting for response id ${target_id}${NC}" >&2
        return 1
      fi
    fi
  done
}

# Initialize MCP
init_request=$(jq -c -n \
  --arg version "${MCP_PROTOCOL_VERSION}" \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":$version,"capabilities":{},"clientInfo":{"name":"docker-ios-test","version":"1.0.0"}}}')
send_request "${init_request}"
init_response=$(read_for_id 1)

if echo "${init_response}" | jq -e '.result.serverInfo' >/dev/null 2>&1; then
  server_name=$(echo "${init_response}" | jq -r '.result.serverInfo.name')
  server_version=$(echo "${init_response}" | jq -r '.result.serverInfo.version')
  echo -e "${GREEN}MCP initialized: ${server_name} v${server_version}${NC}"
else
  echo -e "${RED}MCP initialization failed${NC}" >&2
  echo "${init_response}" >&2
  exit 1
fi

# Run doctor diagnostics for iOS
echo -e "${GREEN}Running doctor diagnostics...${NC}"
doctor_request=$(jq -c -n \
  '{"jsonrpc":"2.0","id":100,"method":"tools/call","params":{"name":"doctor","arguments":{"ios":true}}}')
send_request "${doctor_request}"
doctor_response="$(read_for_id 100)"

if echo "${doctor_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${YELLOW}doctor returned error:${NC}"
  echo "${doctor_response}" | jq -r '.error.message // .error' >&2
else
  doctor_payload="$(echo "${doctor_response}" | jq -r '.result.content[0].text')"
  total_checks="$(echo "${doctor_payload}" | jq -r '.summary.total // 0')"
  passed_checks="$(echo "${doctor_payload}" | jq -r '.summary.passed // 0')"
  failed_checks="$(echo "${doctor_payload}" | jq -r '.summary.failed // 0')"
  warn_checks="$(echo "${doctor_payload}" | jq -r '.summary.warnings // 0')"
  if [[ "${failed_checks}" -gt 0 ]]; then
    echo -e "${RED}doctor: ${passed_checks}/${total_checks} passed, ${failed_checks} failed, ${warn_checks} warnings${NC}"
  elif [[ "${warn_checks}" -gt 0 ]]; then
    echo -e "${YELLOW}doctor: ${passed_checks}/${total_checks} passed, ${warn_checks} warnings${NC}"
  else
    echo -e "${GREEN}doctor: ${passed_checks}/${total_checks} passed${NC}"
  fi
  # Show any failed or warning checks
  echo "${doctor_payload}" | jq -r '
    [.system.checks[]?, .ios.checks[]?, .autoMobile.checks[]?]
    | map(select(.status == "fail" or .status == "warn"))
    | .[]
    | "  - \(.name): \(.status) - \(.message // "")"
  ' 2>/dev/null || true
fi

# List device images (should include iOS simulators via host control)
list_request=$(jq -c -n \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"listDeviceImages","arguments":{"platform":"ios"}}}')
send_request "${list_request}"
list_response=$(read_for_id 2)

if echo "${list_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${YELLOW}listDeviceImages for iOS returned error (expected if not implemented):${NC}"
  echo "${list_response}" | jq -r '.error.message // .error' >&2
else
  list_payload=$(echo "${list_response}" | jq -r '.result.content[0].text // empty')
  if [[ -n "${list_payload}" ]]; then
    image_count=$(echo "${list_payload}" | jq -r '.images | length // 0')
    echo -e "${GREEN}listDeviceImages: ${image_count} iOS images${NC}"
  fi
fi

# List booted devices
booted_request=$(jq -c -n \
  '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"automobile:devices/booted/ios"}}')
send_request "${booted_request}"
booted_response=$(read_for_id 3)

if echo "${booted_response}" | jq -e '.error' >/dev/null 2>&1; then
  echo -e "${YELLOW}Booted iOS devices resource not available (expected if not implemented)${NC}"
else
  booted_payload=$(echo "${booted_response}" | jq -r '.result.contents[0].text // empty')
  if [[ -n "${booted_payload}" ]]; then
    device_count=$(echo "${booted_payload}" | jq -r '.devices | length // 0')
    echo -e "${GREEN}Booted iOS devices: ${device_count}${NC}"
  fi
fi

# ========================================================================
# iOS Reminders App Exploration (only if a simulator is booted)
# ========================================================================
if [[ "${simulator_state}" == "Booted" ]]; then
  echo ""
  echo -e "${GREEN}Testing iOS Reminders app exploration...${NC}"

  # Launch Reminders app
  echo -e "${YELLOW}Launching Reminders app...${NC}"
  launch_request=$(jq -c -n \
    --arg udid "${simulator_udid}" \
    '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"launchApp","arguments":{"appId":"com.apple.reminders","deviceId":$udid}}}')
  send_request "${launch_request}"
  launch_response=$(read_for_id 10)

  if echo "${launch_response}" | jq -e '.result.content[0].text' >/dev/null 2>&1; then
    launch_payload=$(echo "${launch_response}" | jq -r '.result.content[0].text')
    if echo "${launch_payload}" | jq -e '.observation' >/dev/null 2>&1; then
      echo -e "${GREEN}  launchApp: OK - Reminders launched${NC}"
    else
      echo -e "${YELLOW}  launchApp: Returned but no observation${NC}"
      echo "${launch_payload}" | jq -r '.message // .' | head -3
    fi
  else
    echo -e "${YELLOW}  launchApp: Response format unexpected${NC}"
    echo "${launch_response}" | jq -r '.error.message // .error // .' | head -3
  fi

  # Wait for app to fully launch
  sleep 2

  # Observe the screen
  echo -e "${YELLOW}Observing screen...${NC}"
  observe_request=$(jq -c -n \
    --arg udid "${simulator_udid}" \
    '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"observe","arguments":{"platform":"ios","deviceId":$udid}}}')
  send_request "${observe_request}"
  observe_response=$(read_for_id 11)

  if echo "${observe_response}" | jq -e '.result.content[0].text' >/dev/null 2>&1; then
    observe_payload=$(echo "${observe_response}" | jq -r '.result.content[0].text')

    # Check for elements
    clickable_count=$(echo "${observe_payload}" | jq -r '.elements.clickable | length // 0')
    text_count=$(echo "${observe_payload}" | jq -r '.elements.text | length // 0')
    active_app=$(echo "${observe_payload}" | jq -r '.activeWindow.appId // "unknown"')
    screen_size=$(echo "${observe_payload}" | jq -r '"\(.screenSize.width)x\(.screenSize.height)"')

    echo -e "${GREEN}  observe: OK${NC}"
    echo -e "${GREEN}    Active app: ${active_app}${NC}"
    echo -e "${GREEN}    Screen size: ${screen_size}${NC}"
    echo -e "${GREEN}    Clickable elements: ${clickable_count}${NC}"
    echo -e "${GREEN}    Text elements: ${text_count}${NC}"

    # Show some UI elements found
    echo -e "${YELLOW}  Sample UI elements:${NC}"
    echo "${observe_payload}" | jq -r '.elements.clickable[:5][] | "    - \(.label // .text // .id // "unnamed") [\(.type // "unknown")]"' 2>/dev/null || true

    # Try to tap on "Add List" or similar if available
    add_button=$(echo "${observe_payload}" | jq -r '.elements.clickable[] | select(.label == "Add List" or .text == "Add List" or .label == "New Reminder" or .accessibilityLabel == "Add List") | .id // .label // .text' | head -1)

    if [[ -n "${add_button}" && "${add_button}" != "null" ]]; then
      echo -e "${YELLOW}  Found 'Add List' button, attempting tap...${NC}"
      tap_request=$(jq -c -n \
        --arg udid "${simulator_udid}" \
        --arg text "Add List" \
        '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"tapOn","arguments":{"text":$text,"platform":"ios","deviceId":$udid}}}')
      send_request "${tap_request}"
      tap_response=$(read_for_id 12)

      if echo "${tap_response}" | jq -e '.result.content[0].text' >/dev/null 2>&1; then
        echo -e "${GREEN}  tapOn: OK${NC}"
      else
        echo -e "${YELLOW}  tapOn: ${tap_response}${NC}"
      fi
    fi
  else
    echo -e "${YELLOW}  observe: Response format unexpected${NC}"
    echo "${observe_response}" | jq -r '.error.message // .error // .' | head -3
  fi

  echo -e "${GREEN}iOS Reminders exploration complete${NC}"
else
  echo -e "${YELLOW}Skipping Reminders exploration (no booted simulator)${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}iOS Host Control Integration Test PASSED${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Summary:"
echo "  - Host control daemon: Working"
echo "  - iOS info: Detected"
echo "  - Simulators available: ${simulator_count}"
echo "  - Docker MCP: Connected"
if [[ "${simulator_state}" == "Booted" ]]; then
  echo "  - Reminders exploration: Attempted"
fi
echo ""
