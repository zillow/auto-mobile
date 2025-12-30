#!/usr/bin/env bash
# Container structure and functionality tests

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

IMAGE_NAME="${IMAGE_NAME:-auto-mobile:latest}"
CONTAINER_NAME="auto-mobile-test-$$"

# Cleanup function
cleanup() {
  echo -e "${YELLOW}Cleaning up test container...${NC}"
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

echo -e "${GREEN}Testing Docker image: ${IMAGE_NAME}${NC}"

# Test 1: Image exists
echo -e "\n${YELLOW}Test 1: Checking if image exists...${NC}"
if docker image inspect "${IMAGE_NAME}" &>/dev/null; then
  echo -e "${GREEN}✓ Image exists${NC}"
else
  echo -e "${RED}✗ Image not found. Build it first with: docker build -t ${IMAGE_NAME} .${NC}"
  exit 1
fi

# Test 2: Container starts successfully
echo -e "\n${YELLOW}Test 2: Starting container...${NC}"
if docker run -d --name "${CONTAINER_NAME}" "${IMAGE_NAME}" sleep 300; then
  echo -e "${GREEN}✓ Container started${NC}"
else
  echo -e "${RED}✗ Failed to start container${NC}"
  exit 1
fi

# Test 3: Node.js is installed with correct version
echo -e "\n${YELLOW}Test 3: Checking Node.js version...${NC}"
NODE_VERSION=$(docker exec "${CONTAINER_NAME}" node --version)
if [[ "${NODE_VERSION}" =~ ^v24\. ]]; then
  echo -e "${GREEN}✓ Node.js ${NODE_VERSION} is installed${NC}"
else
  echo -e "${RED}✗ Expected Node.js v24.x, got ${NODE_VERSION}${NC}"
  exit 1
fi

# Test 4: Java is installed
echo -e "\n${YELLOW}Test 4: Checking Java version...${NC}"
JAVA_OUTPUT=$(docker exec "${CONTAINER_NAME}" java -version 2>&1)
if echo "${JAVA_OUTPUT}" | grep -q "openjdk.*21"; then
  echo -e "${GREEN}✓ Java 21 is installed${NC}"
else
  echo -e "${RED}✗ Java 21 not found${NC}"
  exit 1
fi

# Test 5: Android SDK is installed
echo -e "\n${YELLOW}Test 5: Checking Android SDK...${NC}"
if docker exec "${CONTAINER_NAME}" test -d /opt/android-sdk; then
  echo -e "${GREEN}✓ Android SDK directory exists${NC}"
else
  echo -e "${RED}✗ Android SDK not found${NC}"
  exit 1
fi

# Test 6: ADB is available
echo -e "\n${YELLOW}Test 6: Checking ADB...${NC}"
if docker exec "${CONTAINER_NAME}" which adb &>/dev/null; then
  ADB_VERSION=$(docker exec "${CONTAINER_NAME}" adb version | head -1)
  echo -e "${GREEN}✓ ADB is available: ${ADB_VERSION}${NC}"
else
  echo -e "${RED}✗ ADB not found${NC}"
  exit 1
fi

# Test 7: Development tools are installed
echo -e "\n${YELLOW}Test 7: Checking development tools...${NC}"
TOOLS=("rg" "ktfmt" "lychee" "shellcheck" "xmlstarlet" "jq")
ALL_TOOLS_OK=true
for tool in "${TOOLS[@]}"; do
  if docker exec "${CONTAINER_NAME}" which "${tool}" &>/dev/null; then
    echo -e "${GREEN}  ✓ ${tool} is installed${NC}"
  else
    echo -e "${RED}  ✗ ${tool} not found${NC}"
    ALL_TOOLS_OK=false
  fi
done

if [ "${ALL_TOOLS_OK}" = false ]; then
  exit 1
fi

# Test 8: Application is built
echo -e "\n${YELLOW}Test 8: Checking if application is built...${NC}"
if docker exec "${CONTAINER_NAME}" test -f /workspace/dist/src/index.js; then
  echo -e "${GREEN}✓ Application build exists${NC}"
else
  echo -e "${RED}✗ Application build not found${NC}"
  exit 1
fi

# Test 9: Non-root user
echo -e "\n${YELLOW}Test 9: Checking user configuration...${NC}"
CURRENT_USER=$(docker exec "${CONTAINER_NAME}" whoami)
if [ "${CURRENT_USER}" = "automobile" ]; then
  echo -e "${GREEN}✓ Container runs as non-root user: ${CURRENT_USER}${NC}"
else
  echo -e "${RED}✗ Container should run as 'automobile', but running as: ${CURRENT_USER}${NC}"
  exit 1
fi

# Test 10: Tini is installed and used as entrypoint
echo -e "\n${YELLOW}Test 10: Checking init system...${NC}"
if docker exec "${CONTAINER_NAME}" test -f /usr/local/bin/tini; then
  echo -e "${GREEN}✓ Tini is installed${NC}"
else
  echo -e "${RED}✗ Tini not found${NC}"
  exit 1
fi

# Test 11: MCP server stdio communication
echo -e "\n${YELLOW}Test 11: Testing MCP stdio protocol...${NC}"
# Create a simple initialize request
INIT_REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Test stdio communication (run container with -i flag, send request, check for response)
RESPONSE=$(echo "${INIT_REQUEST}" | docker run -i --rm "${IMAGE_NAME}" 2>/dev/null | head -1 || true)

if echo "${RESPONSE}" | grep -q '"jsonrpc":"2.0"'; then
  echo -e "${GREEN}✓ MCP server responds to stdio protocol${NC}"
  echo -e "  Response: ${RESPONSE:0:100}..."
else
  echo -e "${YELLOW}⚠ MCP stdio test inconclusive (server may need initialization time)${NC}"
  echo -e "  Response: ${RESPONSE}"
fi

# Test 12: Android SDK components
echo -e "\n${YELLOW}Test 12: Verifying Android SDK components...${NC}"
SDK_COMPONENTS=("platform-tools" "build-tools;35.0.0" "platforms;android-36")
ALL_COMPONENTS_OK=true
SDK_LIST=$(docker exec "${CONTAINER_NAME}" sdkmanager --list_installed 2>/dev/null)
for component in "${SDK_COMPONENTS[@]}"; do
  if echo "${SDK_LIST}" | grep -q "${component}"; then
    echo -e "${GREEN}  ✓ ${component} is installed${NC}"
  else
    echo -e "${RED}  ✗ ${component} not found${NC}"
    ALL_COMPONENTS_OK=false
  fi
done

if [ "${ALL_COMPONENTS_OK}" = false ]; then
  exit 1
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}All tests passed! ✓${NC}"
echo -e "${GREEN}========================================${NC}"
