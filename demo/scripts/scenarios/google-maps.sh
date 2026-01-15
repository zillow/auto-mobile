#!/usr/bin/env bash
set -euo pipefail

# Google Maps Demo - Find NYC and zoom to Manhattan

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Open Google Maps, find New York City, and zoom in until only Manhattan is visible"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you navigate to New York City in Google Maps and zoom to Manhattan."



# ⏺ auto-mobile - launchApp (MCP)(appId: "com.google.android.apps.maps")

# ⏺ auto-mobile - tapOn (MCP)(platform: "android", action: "tap", id:
#                            "com.google.android.apps.maps:id/search_omnibox_text_box")

# ⏺ auto-mobile - inputText (MCP)(platform: "android", text: "New York City", imeAction: "search")

# ⏺ auto-mobile - tapOn (MCP)(platform: "android", action: "tap", text: "Search")

# ⏺ auto-mobile - pinchOn (MCP)(platform: "android", direction: "out", autoTarget: true,
#                              duration: 500)

# ⏺ auto-mobile - pinchOn (MCP)(platform: "android", direction: "out", autoTarget: true, duration: 500)

# ⏺ auto-mobile - pinchOn (MCP)(platform: "android", direction: "out", autoTarget: true,
#                              duration: 500)

# Step 1: Launch Google Maps
echo ""
add_line "●${GRAY} Launching Google Maps…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.apps.maps\")${RESET}"
call_mcp_tool "launchApp" --appId "com.google.android.apps.maps" --coldBoot true --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.google.android.apps.maps\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Google Maps launched${RESET}"

# Step 2: Pinch out to zoom out and see more area
echo ""
add_line "●${GRAY} Zooming out to find New York City…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - pinchOn (MCP)${RESET}${GRAY} (direction: \"in\", scale: 0.3)${RESET}"
call_mcp_tool "pinchOn" --direction "in" --scale '"0.3"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - pinchOn (MCP)${RESET}${GRAY} (direction: \"in\", scale: 0.3)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Zoomed out${RESET}"

# Step 3: Search for New York City
echo ""
add_line "●${GRAY} Searching for New York City…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Search here\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"text": "Search here"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Search here\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Search activated${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"New York City\")${RESET}"
call_mcp_tool "inputText" --text "New York City" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"New York City\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Text entered${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - imeAction (MCP)${RESET}${GRAY} (action: \"search\")${RESET}"
call_mcp_tool "imeAction" --action "search" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - imeAction (MCP)${RESET}${GRAY} (action: \"search\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Search submitted${RESET}"

# Step 4: Zoom in to Manhattan
echo ""
add_line "●${GRAY} Zooming in to Manhattan…${RESET}"

sleep 3

echo ""
add_line "${BOLD}● auto-mobile - pinchOn (MCP)${RESET}${GRAY} (direction: \"out\", scale: 2.0)${RESET}"
call_mcp_tool "pinchOn" --direction "out" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - pinchOn (MCP)${RESET}${GRAY} (direction: \"out\", scale: 2.0)${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Manhattan is now visible${RESET}"

# Summary
add_line ""
add_line "Successfully navigated to New York City and zoomed to Manhattan view!"

# Show footer
show_footer
