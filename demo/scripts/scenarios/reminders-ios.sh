#!/usr/bin/env bash
set -euo pipefail

# Reminders iOS Demo - Open and close the Reminders app

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Open the Reminders app on iOS and then close it"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll open the Reminders app on the iOS simulator and then close it."

# Step 1: Launch Reminders app
echo ""
add_line "●${GRAY} Launching Reminders app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.apple.reminders\")${RESET}"
call_ios_tool "launchApp" --appId "com.apple.reminders" --platform "ios"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.apple.reminders\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App launched${RESET}"

# Pause to let the user see the app
sleep 2

# Step 2: Terminate Reminders app
echo ""
add_line "●${GRAY} Closing Reminders app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.apple.reminders\")${RESET}"
call_ios_tool "terminateApp" --appId "com.apple.reminders" --platform "ios"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.apple.reminders\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Summary
add_line ""
add_line "Successfully opened and closed the Reminders app on iOS!"

# Show footer
show_footer
