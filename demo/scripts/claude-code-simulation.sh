#!/usr/bin/env bash
# Shared functions for simulating Claude Code interface with AutoMobile MCP

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
GRAY='\033[0;90m'
RESET='\033[0m'
BOLD='\033[1m'

# Helper function to call AutoMobile MCP tools
call_mcp_tool() {
  local tool_name="$1"
  shift
  # Run the tool silently in the background, discarding output
  bun run "$PROJECT_ROOT/src/index.ts" --cli "$tool_name" "$@" > /dev/null 2>&1 || true
}

# Helper function for iOS simulator actions using direct simctl commands.
# This produces identical visual results to call_mcp_tool but uses direct
# simctl calls which generate display frames needed by simctl video recording.
call_ios_tool() {
  local tool_name="$1"
  shift

  case "$tool_name" in
    launchApp)
      local app_id=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --appId) app_id="$2"; shift 2 ;;
          --platform|--clearAppData) shift 2 ;;
          *) shift ;;
        esac
      done
      xcrun simctl launch booted "$app_id" > /dev/null 2>&1 || true
      ;;
    terminateApp)
      local app_id=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --appId) app_id="$2"; shift 2 ;;
          --platform) shift 2 ;;
          *) shift ;;
        esac
      done
      xcrun simctl terminate booted "$app_id" > /dev/null 2>&1 || true
      ;;
    tapOn|swipeOn|inputText|pressButton|pressKey|observe)
      # Fall back to MCP tool for interaction commands
      bun run "$PROJECT_ROOT/src/index.ts" --cli "$tool_name" "$@" > /dev/null 2>&1 || true
      ;;
    *)
      # Default: use MCP tool
      bun run "$PROJECT_ROOT/src/index.ts" --cli "$tool_name" "$@" > /dev/null 2>&1 || true
      ;;
  esac
}

# Helper function to show MCP tool call
show_mcp_call() {
  local tool_name="$1"
  local params="$2"
  echo -e "${GREEN}●${RESET}${BOLD} auto-mobile - ${tool_name} (MCP)${RESET}${GRAY}${params}${RESET}"
}

# Helper function to show thinking/progress
show_progress() {
  local message="$1"
  echo -e "${GRAY}● ${message}…${RESET}"
}

# Helper function to add content (just echo for now)
add_line() {
  sleep 0.1
  local line="$1"
  echo -e "$line"
}

# Helper function to replace the previous line
replace_prev_line() {
  local line="$1"
  # Move cursor up one line, clear it, then print new content
  echo -e "\033[1A\033[2K$line"
}

# Show header with user prompt
show_header() {
  local prompt="$1"
  clear
  echo "──────────────────────────────────────────────────────────────────────────────────"
  echo -e "${YELLOW}❯${RESET} ${prompt}"
  echo "──────────────────────────────────────────────────────────────────────────────────"
  echo ""
}

# Show thinking animation
show_thinking() {
  echo ""
  echo -e "${GRAY}● Demoing… (ctrl+c to interrupt)${RESET}"
  echo ""
  sleep 0.5
}

# Show final ready prompt
show_footer() {
  echo ""
  echo "──────────────────────────────────────────────────────────────────────────────────"
  echo -e "${YELLOW}❯${RESET}"
  echo "──────────────────────────────────────────────────────────────────────────────────"
}
