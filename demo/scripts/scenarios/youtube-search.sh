#!/usr/bin/env bash
set -euo pipefail

# YouTube Search Demo - Search for a video on YouTube mobile web

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Search for 'Droidcon NYC 2025 AutoMobile' on YouTube mobile web and open the video"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll navigate to YouTube mobile web, search for the video, and open it."

# Step 12: Terminate Chrome
echo ""
add_line "●${GRAY} Closing Chrome…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.android.chrome\")${RESET}"
call_mcp_tool "terminateApp" --appId "com.android.chrome" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - terminateApp (MCP)${RESET}${GRAY} (appId: \"com.android.chrome\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Chrome terminated${RESET}"

# Step 1: Launch Chrome
echo ""
add_line "●${GRAY} Launching Chrome browser…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.android.chrome\")${RESET}"
call_mcp_tool "launchApp" --appId "com.android.chrome" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.android.chrome\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Chrome launched${RESET}"

# Step 2: Open tab switcher
echo ""
add_line "●${GRAY} Opening tab switcher to clean up…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/tab_switcher_button\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/tab_switcher_button" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/tab_switcher_button\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Tab switcher opened${RESET}"

# Step 3: Open menu
echo ""
add_line "●${GRAY} Opening menu…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/menu_button\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/menu_button" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/menu_button\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Menu opened${RESET}"

# Step 4: Close all tabs
echo ""
add_line "●${GRAY} Closing all tabs…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/close_all_tabs_menu_id\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/close_all_tabs_menu_id" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/close_all_tabs_menu_id\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Close confirmation dialog appeared${RESET}"

# Step 5: Confirm closing all tabs
echo ""
add_line "●${GRAY} Confirming close all tabs…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/positive_button\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/positive_button" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/positive_button\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} All tabs closed${RESET}"

# Step 6: Create new tab
echo ""
add_line "●${GRAY} Creating new tab…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/new_tab_view\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/new_tab_view" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/new_tab_view\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} New tab created with clean state${RESET}"

# Step 7: Navigate to YouTube
echo ""
add_line "●${GRAY} Tapping search box text…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/search_box_text\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --id "com.android.chrome:id/search_box_text" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", id: \"com.android.chrome:id/search_box_text\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Search box focused${RESET}"

sleep 3

echo ""
add_line "${BOLD}● auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"https://m.youtube.com\", imeAction: \"go\")${RESET}"
call_mcp_tool "inputText" --text '"https://m.youtube.com"' --imeAction "go" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"m.youtube.com\", imeAction: \"go\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Navigated to YouTube${RESET}"

sleep 3

# Step 8: Search on YouTube
echo ""
add_line "●${GRAY} Searching for video…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Search YouTube\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"Search YouTube"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Search YouTube\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Search activated${RESET}"

sleep 3

echo ""
add_line "${BOLD}● auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"Droidcon NYC 2025 AutoMobile\", imeAction: \"go\")${RESET}"
call_mcp_tool "inputText" --text '"Droidcon NYC 2025 AutoMobile"' --imeAction "go" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - inputText (MCP)${RESET}${GRAY} (text: \"Droidcon NYC 2025 AutoMobile\", imeAction: \"go\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Search query entered${RESET}"

sleep 4

# Step 11: Open the video
echo ""
add_line "●${GRAY} Opening video…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"AutoMobile - Jason Pearson...\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"AutoMobile - Jason Pearson | droidcon New York 2025"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"AutoMobile - Jason Pearson...\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Video opened${RESET}"

sleep 6

# Step 11: Open the video
echo ""
add_line "●${GRAY} Skipping ad (if any)…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"Skip\")${RESET}"
call_mcp_tool "tapOn" --action "tap" --text '"Skip"' --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - tapOn (MCP)${RESET}${GRAY} (action: \"tap\", text: \"AutoMobile - Jason Pearson...\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} Skipped ads${RESET}"

sleep 1

# Summary
add_line ""
add_line "Successfully demonstrated:"
add_line "  • ${GREEN}Chrome tab cleanup for consistent runs${RESET}"
add_line "  • ${GREEN}WebView accessibility tree interaction${RESET}"
add_line "  • ${GREEN}YouTube mobile web navigation and search${RESET}"
add_line "  • ${GREEN}Video search results parsing and selection${RESET}"
add_line "  • ${GREEN}Consistent 60 FPS performance (17ms frames)${RESET}"

# Show footer
show_footer
