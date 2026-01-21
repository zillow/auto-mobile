#!/usr/bin/env bash
set -euo pipefail

# Bug Reproduction Demo - Test UI state update bug detection

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Test bug reproduction demo with UI state update detection"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll demonstrate the bug reproduction flow with state update detection."

# Step 1: Launch app via deeplink
echo ""
add_line "●${GRAY} Opening Bug Reproduction Demo via deeplink…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/bugs/repro\")${RESET}"
call_mcp_tool "openLink" --url "automobile://playground/demos/bugs/repro" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - openLink (MCP)${RESET}${GRAY} (url: \"automobile://playground/demos/bugs/repro\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Bug Reproduction Demo opened${RESET}"

# Step 2: Test normal behavior (bug disabled)
echo ""
add_line "●${GRAY} Testing normal behavior (bug disabled)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Expected: 1, Displayed: 1 (synced)${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Expected: 2, Displayed: 2 (synced)${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Expected: 3, Displayed: 3 (synced) - Normal behavior confirmed${RESET}"

# Step 3: Enable the bug
echo ""
add_line "●${GRAY} Enabling bug toggle…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_toggle\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_toggle" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_toggle\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Bug enabled${RESET}"

# Step 4: Reproduce the bug
echo ""
add_line "●${GRAY} Reproducing bug (expected count increments, displayed freezes)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${YELLOW}⚠${RESET}${GRAY}  Expected: 4, Displayed: 3 (bug reproduced - UI frozen)${RESET}"

# Step 4: Reproduce the bug
echo ""
add_line "●${GRAY} Found issue${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - highlight (MCP)${RESET}${GRAY} (text: \"Displayed count: 3\")${RESET}"
call_mcp_tool "highlight" --action "tap" --text "Displayed" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - highlight (MCP)${RESET}${GRAY} (text: \"Displayed count: 3\")${RESET}"
add_line "${GRAY}  └  ${YELLOW}⚠${RESET}${GRAY}  Expected: 4, Displayed: 3 (bug reproduced - UI frozen)${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${YELLOW}⚠${RESET}${GRAY}  Expected: 5, Displayed: 3 (gap widening)${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${YELLOW}⚠${RESET}${GRAY}  Expected: 6, Displayed: 3 (delta: 3)${RESET}"

# Step 5: Reset
echo ""
add_line "●${GRAY} Testing reset functionality…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_reset\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_reset" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_reset\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Both counts reset to 0, bug toggle remains enabled${RESET}"

# Step 6: Disable bug and verify
echo ""
add_line "●${GRAY} Disabling bug and verifying normal behavior restored…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_toggle\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_toggle" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_toggle\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Bug disabled${RESET}"

echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "bug_repro_add" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"bug_repro_add\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Expected: 1, Displayed: 1 (normal behavior restored)${RESET}"

# Step 7: Terminate app
echo ""
add_line "●${GRAY} Closing Playground app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
call_mcp_tool "terminateApp" --appId "dev.jasonpearson.automobile.playground" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"dev.jasonpearson.automobile.playground\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App terminated${RESET}"

# Summary
add_line ""
add_line "Bug reproduction verified:"
add_line "  • ${GREEN}Normal mode: Counts synced (3 taps → 3 updates)${RESET}"
add_line "  • ${YELLOW}Bug enabled: Counts diverged (6 expected vs 3 displayed)${RESET}"
add_line "  • ${GREEN}Reset: Cleared all counts successfully${RESET}"
add_line "  • ${GREEN}Post-fix: Normal behavior restored${RESET}"

# Show footer
show_footer
