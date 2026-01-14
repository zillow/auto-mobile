#!/usr/bin/env bash
set -euo pipefail

# Slack Status Demo - Set status to "Out sick" until January 17th

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Set my Slack status to Out sick until January 17th"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you set your Slack status to \"Out sick\" and configure it to clear on January 17th."

# Step 1: Launch Slack
echo ""
add_line "●${GRAY} Opening Slack…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.Slack\")${RESET}"
call_mcp_tool "launchApp" --appId "com.Slack" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.Slack\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Slack launched${RESET}"

# Step 2: Navigate to profile/status screen
# Note: This assumes we can get to the status screen from the current position
# In practice, you may need to tap on the profile or "You" tab first
echo ""
add_line "●${GRAY} Navigating to status settings…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
call_mcp_tool "observe" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Located status screen${RESET}"

# Step 3: Select "Out sick" status
echo ""
add_line "●${GRAY} Selecting \"Out sick\" status…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Out sick\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "Out sick" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Out sick\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Status selected${RESET}"

# Step 4: Open expiration options
echo ""
add_line "●${GRAY} Opening expiration options…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.Slack:id/expiration_view\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.Slack:id/expiration_view" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.Slack:id/expiration_view\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Expiration options opened${RESET}"

# Step 5: Choose date and time
echo ""
add_line "●${GRAY} Selecting custom date option…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Choose date and time\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "Choose date and time" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Choose date and time\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Custom date option selected${RESET}"

# Step 6: Open date picker
echo ""
add_line "●${GRAY} Opening date picker…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.Slack:id/expiration_date_selector\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.Slack:id/expiration_date_selector" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.Slack:id/expiration_date_selector\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Date picker opened${RESET}"

# Step 7: Select January 17th
echo ""
add_line "●${GRAY} Selecting January 17th…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"17\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "17" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"17\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Date selected${RESET}"

# Step 8: Confirm date selection
echo ""
add_line "●${GRAY} Confirming date…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "OK" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"OK\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Date confirmed${RESET}"

# Step 9: Go back to status screen
echo ""
add_line "●${GRAY} Returning to status screen…${RESET}"
echo ""
add_line "${BOLD}● Bash${RESET}${GRAY} (adb shell input tap 74 255)${RESET}"
call_mcp_tool "pressButton" --button "back" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} Bash${RESET}${GRAY} (adb shell input tap 74 255)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Back to status screen${RESET}"

# Step 10: Save status
echo ""
add_line "●${GRAY} Saving status…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Save\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "Save" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Save\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Status saved${RESET}"

# Summary
add_line ""
add_line "Successfully set Slack status:"
add_line "  • ${GREEN}Status: 🤒 Out sick${RESET}"
add_line "  • ${GREEN}Expiration: Saturday, January 17th at 1:30 AM${RESET}"
add_line "  • ${GREEN}Multi-step form navigation with date picker${RESET}"
add_line "  • ${GREEN}Automatic status clearing on specified date${RESET}"

# Show footer
show_footer
