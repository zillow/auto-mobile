#!/usr/bin/env bash
set -euo pipefail

# Scroll & Transition Performance Demo - Test scroll performance and transitions

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Test scroll performance and list-to-detail transitions in Performance List Demo"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll test scroll performance with alternating directions and rapid transitions."

# Step 1: Launch app via deeplink
echo ""
add_line "●${GRAY} Opening Performance List Demo via deeplink…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/perf/list\")${RESET}"
call_mcp_tool "openLink" --url "automobile://playground/demos/perf/list" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/perf/list\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Performance List Demo opened${RESET}"

# Step 2: Swipe UP (fast)
echo ""
add_line "●${GRAY} Testing scroll performance (UP direction)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\", container.elementId: \"performance_list\")${RESET}"
call_mcp_tool "swipeOn" --direction "up" --speed "fast" --container '{"elementId":"performance_list"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\", container.elementId: \"performance_list\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Scrolled up - 16ms median frame time (60 FPS)${RESET}"

# Step 3: Swipe DOWN (fast)
echo ""
add_line "●${GRAY} Testing scroll performance (DOWN direction)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"down\", speed: \"fast\", container.elementId: \"performance_list\")${RESET}"
call_mcp_tool "swipeOn" --direction "down" --speed "fast" --container '{"elementId":"performance_list"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"down\", speed: \"fast\", container.elementId: \"performance_list\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Scrolled down - 4950ms frame time (measurement ceiling)${RESET}"

# Step 4: Swipe UP again
echo ""
add_line "●${GRAY} Testing scroll performance (UP direction)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\")${RESET}"
call_mcp_tool "swipeOn" --direction "up" --speed "fast" --container '{"elementId":"performance_list"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Scrolled up - 16ms median frame time (60 FPS)${RESET}"

# Step 5: Swipe DOWN again
echo ""
add_line "●${GRAY} Testing scroll performance (DOWN direction)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"down\", speed: \"fast\")${RESET}"
call_mcp_tool "swipeOn" --direction "down" --speed "fast" --container '{"elementId":"performance_list"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"down\", speed: \"fast\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Scrolled down - 4950ms frame time (measurement ceiling)${RESET}"

# Step 6: Swipe UP final
echo ""
add_line "●${GRAY} Testing scroll performance (UP direction)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\")${RESET}"
call_mcp_tool "swipeOn" --direction "up" --speed "fast" --container '{"elementId":"performance_list"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"fast\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Scrolled up - 16ms median frame time (60 FPS)${RESET}"

# Step 11: Scroll and tap another item
echo ""
add_line "●${GRAY} Scrolling to find Product 87…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"normal\", lookFor.text: \"Product 80\")${RESET}"
call_mcp_tool "swipeOn" --direction "up" --speed "normal" --lookFor '{"text":"Product 80"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - swipeOn (MCP)${RESET}${GRAY} (direction: \"up\", speed: \"normal\", lookFor.text: \"Product 80\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Found Product 80${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"performance_item_80_action\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --selector '{"id": "performance_item_80_action"}' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"performance_item_80_action\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Navigated to Product 80 detail${RESET}"

# Step 12: Terminate app
echo ""
add_line "●${GRAY} Closing Playground app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
call_mcp_tool "terminateApp" --appId "dev.jasonpearson.automobile.playground" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Summary
add_line ""
add_line "Performance findings:"
add_line "  • ${GREEN}Forward scrolling (UP): 16ms median (60 FPS), stable${RESET}"
add_line "  • ${YELLOW}Backward scrolling (DOWN): 4950ms (measurement ceiling)${RESET}"
add_line "  • ${GREEN}List-to-detail transitions: ~20ms frames, ~550ms total${RESET}"
add_line "  • ${GREEN}Rapid navigation maintains performance${RESET}"

# Show footer
show_footer
