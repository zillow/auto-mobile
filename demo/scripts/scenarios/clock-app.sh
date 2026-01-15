#!/usr/bin/env bash
set -euo pipefail

# Clock App Demo - Set a 6:30 AM alarm

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Set a 6:30 AM alarm in the Clock app"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you set a 6:30 AM alarm in the Clock app."

# Step 1: Launch Clock app
echo ""
add_line "●${GRAY} Launching Clock app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock\", clearAppData: true)${RESET}"
call_mcp_tool "launchApp" --appId "com.google.android.deskclock" --clearAppData true --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock\", clearAppData: true)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App launched${RESET}"

# Step 2: Tap Alarm tab
echo ""
add_line "●${RESET}${GRAY} Opening Alarm section…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Alarm\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"text": "Alarm"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Alarm\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm tab opened${RESET}"

# Step 3: Tap add alarm button
echo ""
add_line "●${GRAY} Creating new alarm…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Add alarm\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"id": "com.google.android.deskclock:id/fab"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", selector: \"'{\"id\": \"com.google.android.deskclock:id/fab\"}'\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm creation dialog opened${RESET}"

# Step 4: Tap 6 for hours
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"6\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"text": "6"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"6\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Selected 6${RESET}"

# Step 5: Tap 30 minutes
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"30\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"text": "30"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"30\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Time set to 6:30 AM${RESET}"

# Step 6: Confirm alarm
echo ""
add_line "●${GRAY} Confirming alarm…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"text": "OK"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Alarm saved${RESET}"

# Step 7: Terminate app
echo ""
add_line "●${GRAY} Closing Clock app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock\")${RESET}"
call_mcp_tool "terminateApp" --appId "com.google.android.deskclock" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.deskclock\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Summary
add_line ""
add_line "Successfully created a 6:30 AM alarm in the Clock app!"

# Show footer
show_footer
