#!/usr/bin/env bash
set -euo pipefail

# Deep Link Startup Demo - Launch app via deeplink and measure startup performance

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Launch Playground app via deeplink to Startup Demo and measure performance"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll terminate the app, launch via deeplink, and measure startup performance."

# Step 1: Terminate app for cold start
echo ""
add_line "●${GRAY} Terminating app for cold start…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
call_mcp_tool "terminateApp" --appId "dev.jasonpearson.automobile.playground" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Step 2: Open deeplink to startup demo
echo ""
add_line "●${GRAY} Opening deeplink to Startup Demo…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/perf/startup\")${RESET}"
call_mcp_tool "openLink" --url "automobile://playground/demos/perf/startup" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/perf/startup\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Deeplink opened (28ms intent, 65ms stability, 378ms observe)${RESET}"

# Step 3: Observe app state (workaround for issue #537)
echo ""
add_line "●${GRAY} Observing app state after launch…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
call_mcp_tool "observe" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - observe (MCP)${RESET}${GRAY} (platform: \"android\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App at DemoStartupDestination with 'Ready' signal${RESET}"

# Step 4: Terminate app
echo ""
add_line "●${GRAY} Closing Playground app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
call_mcp_tool "terminateApp" --appId "dev.jasonpearson.automobile.playground" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Summary
add_line ""
add_line "Startup performance measured:"
add_line "  • ${GREEN}Cold start to Ready state: ~100ms${RESET}"
add_line "  • ${GREEN}60 FPS rendering: 16ms median frame time${RESET}"
add_line "  • ${GREEN}Deep link navigation working correctly${RESET}"
add_line "  • ${YELLOW}Note: openLink observation may be stale (issue #537)${RESET}"
add_line "  • ${GREEN}Workaround: Use observe() after openLink${RESET}"

# Show footer
show_footer
