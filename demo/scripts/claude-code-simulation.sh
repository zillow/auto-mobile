#!/usr/bin/env bash
# Shared functions for simulating Claude Code interface with AutoMobile MCP

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for terminal output
BLUE='\033[0;34m'
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
