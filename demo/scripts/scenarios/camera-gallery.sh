#!/usr/bin/env bash
set -euo pipefail

# Camera + Gallery Demo - Take a photo, edit it, and share via Quick Share

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Take a photo, edit it, and share via Quick Share"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you explore the Camera app, take a picture, edit it, and share via Quick Share."

# Step 1: Launch Camera app
echo ""
add_line "●${GRAY} Launching Camera app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.android.camera2\", coldBoot: true)${RESET}"
call_mcp_tool "launchApp" --appId "com.android.camera2" --coldBoot true --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.android.camera2\", coldBoot: true)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Camera app launched${RESET}"

# Step 2: Explore camera settings
echo ""
add_line "●${GRAY} Opening camera settings…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"mode_options_toggle\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.camera2:id/mode_options_toggle" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"mode_options_toggle\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Settings menu opened (showing countdown, grid lines, HDR, flash options)${RESET}"

# Step 3: Take a picture
echo ""
add_line "●${GRAY} Taking a picture…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"shutter_button\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.camera2:id/shutter_button" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"shutter_button\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Picture captured${RESET}"

# Step 4: Open gallery
echo ""
add_line "●${GRAY} Opening gallery to view photo…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"rounded_thumbnail_view\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.camera2:id/rounded_thumbnail_view" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"rounded_thumbnail_view\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Gallery opened with photo${RESET}"

# Step 5: Edit photo
echo ""
add_line "●${GRAY} Opening photo editor…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"filmstrip_bottom_control_edit\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.camera2:id/filmstrip_bottom_control_edit" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"filmstrip_bottom_control_edit\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Intent chooser appeared${RESET}"

# Step 6: Select Markup editor
echo ""
add_line "●${GRAY} Selecting Markup editor…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"button_once\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "android:id/button_once" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"button_once\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Markup editor opened with Crop, Text, Pen, Highlighter, Eraser tools${RESET}"

# Step 7: Interact with crop tool
echo ""
add_line "●${GRAY} Using crop tool…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Top boundary 0 percent\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text "Top boundary 0 percent" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Top boundary 0 percent\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Crop boundaries adjusted${RESET}"

# Step 8: Save edited photo
echo ""
add_line "●${GRAY} Saving edited photo…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"save\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.google.android.markup:id/save" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"save\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Photo saved and returned to gallery${RESET}"

# Step 9: Share photo
echo ""
add_line "●${GRAY} Opening share menu…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"filmstrip_bottom_control_share\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.camera2:id/filmstrip_bottom_control_share" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"filmstrip_bottom_control_share\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Share sheet opened with Quick Share, Maps, Messages, Print, Drive options${RESET}"

# Step 10: Observe Quick Share (navigation to Quick Share would require coordinate tap workaround)
echo ""
add_line "●${GRAY} Observing share options…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
call_mcp_tool "observe" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Quick Share available in share menu${RESET}"

# Step 11: Go back to home
echo ""
add_line "●${GRAY} Returning to home screen…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - pressButton (MCP)${RESET}${GRAY} (button: \"back\")${RESET}"
call_mcp_tool "pressButton" --button "back" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - pressButton (MCP)${RESET}${GRAY} (button: \"back\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Back to gallery${RESET}"

# Step 12: Terminate Camera app
echo ""
add_line "●${GRAY} Closing Camera app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.android.camera2\")${RESET}"
call_mcp_tool "terminateApp" --appId "com.android.camera2" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.android.camera2\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Camera app terminated${RESET}"

# Summary
add_line ""
add_line "Successfully explored Camera app features:"
add_line "  • Opened camera settings (countdown, grid, HDR, flash)"
add_line "  • Captured a photo"
add_line "  • Viewed photo in gallery"
add_line "  • Edited photo using Markup (crop tool)"
add_line "  • Accessed share menu with Quick Share option"

# Show footer
show_footer
