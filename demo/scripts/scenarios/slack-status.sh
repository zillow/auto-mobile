#!/usr/bin/env bash
set -euo pipefail

# Slack Status Demo - Set status to "🔥 I'm awesome"

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Set my Slack status to :fire: I'm awesome"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you set your Slack status to \"🔥 I'm awesome\"."

# Step 1: Launch Slack
echo ""
add_line "●${GRAY} Opening Slack…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.Slack.internal.debug\", coldBoot: true)${RESET}"
call_mcp_tool "launchApp" --appId "com.Slack.internal.debug" --coldBoot true --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.Slack.internal.debug\", coldBoot: true)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Slack launched${RESET}"

# Step 2: Navigate to profile/You screen
# Note: Profile avatar shows "Online" or "Away" depending on user status - try both
echo ""
add_line "●${GRAY} Opening profile screen…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", profile avatar)${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"Online"' --platform "android"
call_mcp_tool "tapOn" --action "tap" --text '"Away"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", profile avatar)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Profile screen opened${RESET}"

# Step 3: Navigate to status screen
echo ""
add_line "●${GRAY} Opening status settings…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Update your status\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"Update your status"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Update your status\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Status screen opened${RESET}"

# Step 4: Open emoji picker
echo ""
add_line "●${GRAY} Opening emoji picker…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", elementId: \"com.Slack.internal.debug:id/status_emoji_picker_btn\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.Slack.internal.debug:id/status_emoji_picker_btn" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", elementId: \"com.Slack.internal.debug:id/status_emoji_picker_btn\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Emoji picker opened${RESET}"

# Step 5: Select fire emoji
echo ""
add_line "●${GRAY} Selecting fire emoji…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"fire\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"fire"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"fire\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Fire emoji selected${RESET}"

# Step 6: Focus on status text field
echo ""
add_line "●${GRAY} Focusing on status text field…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", elementId: \"com.Slack.internal.debug:id/set_status_field\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.Slack.internal.debug:id/set_status_field" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", elementId: \"com.Slack.internal.debug:id/set_status_field\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Text field focused${RESET}"

# Step 7: Enter status text
echo ""
add_line "●${GRAY} Entering status text…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"I'm awesome\")${RESET}"
call_mcp_tool "inputText" --text '"I'"'"'m awesome"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"I'm awesome\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Status text entered${RESET}"

# Step 8: Close keyboard
echo ""
add_line "●${GRAY} Closing keyboard…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - keyboard (MCP)${RESET}${GRAY} (action: \"close\")${RESET}"
call_mcp_tool "keyboard" --action "close" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - keyboard (MCP)${RESET}${GRAY} (action: \"close\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Keyboard closed${RESET}"

# Step 9: Save status
echo ""
add_line "●${GRAY} Saving status…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Save\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"Save"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Save\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Status saved${RESET}"

# Summary
add_line ""
add_line "Successfully set Slack status:"
add_line "  • ${GREEN}Status: 🔥 I'm awesome${RESET}"
add_line "  • ${GREEN}Emoji selected via Slack's emoji picker${RESET}"
add_line "  • ${GREEN}Custom text entered${RESET}"

# Show footer
show_footer
