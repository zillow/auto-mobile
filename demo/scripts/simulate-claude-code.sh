#!/usr/bin/env bash
set -euo pipefail

# Simulates AI CLI interacting with AutoMobile MCP server

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
  # echo "bun run $PROJECT_ROOT/src/index.ts --cli $tool_name $@"
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

# Clear screen and show header
clear
echo "──────────────────────────────────────────────────────────────────────────────────"
echo -e "${YELLOW}❯${RESET} Set a 6:30 AM alarm in the Clock app"
echo "──────────────────────────────────────────────────────────────────────────────────"
echo ""

# Show thinking animation
echo ""
echo -e "${GRAY}● Demoing… (ctrl+c to interrupt)${RESET}"
echo ""
sleep 0.5

# AI response start
add_line "I'll help you set a 6:30 AM alarm in the Clock app."

# Step 4: Tap Alarm tab
echo ""
add_line "●${GRAY} Launching Clock app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock:id/tab_menu_alarm\")${RESET}"
call_mcp_tool "launchApp" --appId "com.google.android.deskclock" --clearAppData true --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock:id/tab_menu_alarm\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App launched${RESET}"

# Step 4: Tap Alarm tab
echo ""
add_line "●${RESET}${GRAY} Opening Alarm section…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.google.android.deskclock:id/tab_menu_alarm\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.google.android.deskclock:id/tab_menu_alarm" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.google.android.deskclock:id/tab_menu_alarm\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm tab opened${RESET}"

# Step 5: Tap add alarm button
echo ""
add_line "●${GRAY} Creating new alarm…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.google.android.deskclock:id/fab\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.google.android.deskclock:id/fab" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.google.android.deskclock:id/fab\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm creation dialog opened${RESET}"

# Step 6: Select hour (6)
echo ""
add_line "●${GRAY} Setting hour to 6…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"6\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"6"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"6\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Hour set to 6${RESET}"

# Step 8: Select minutes (30)
echo ""
add_line "●${GRAY} Setting minutes to 30…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"30\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"30"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"30\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Minutes set to 30${RESET}"

# Step 8: Select minutes (30)
echo ""
add_line "●${GRAY} Setting PM…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"PM\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"PM"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"PM\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Set PM${RESET}"

# Step 9: Confirm alarm
echo ""
add_line "●${GRAY} Confirming alarm time…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"OK"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm saved${RESET}"

# Summary
add_line ""
add_line "Successfully created a 6:30 AM alarm in the Clock app!"

# Show final ready prompt
echo ""
echo "──────────────────────────────────────────────────────────────────────────────────"
echo -e "${YELLOW}❯${RESET}"
echo "──────────────────────────────────────────────────────────────────────────────────"
