# Demo Scenarios

This directory contains demo scenario scripts that simulate Claude Code interacting with AutoMobile MCP.

## Creating a New Scenario

1. Create a new file: `<scenario-name>.sh`
2. Source the shared functions: `source "$SCRIPT_DIR/../claude-code-simulation.sh"`
3. Use the helper functions to simulate the demo
4. Make it executable: `chmod +x <scenario-name>.sh`

## Example Structure

```bash
#!/usr/bin/env bash
set -euo pipefail

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../claude-code-simulation.sh"

# Show header
show_header "Your demo prompt here"

# Show thinking animation
show_thinking

# AI response start
add_line "I'll help you with..."

# Step 1: Launch app
echo ""
add_line "●${GRAY} Launching app…${RESET}"
echo ""
add_line "${BOLD}● auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.example.app\")${RESET}"
call_mcp_tool "launchApp" --appId "com.example.app" --platform "android"
replace_prev_line "${GREEN}●${RESET}${BOLD} auto-mobile - launchApp (MCP)${RESET}${GRAY} (appId: \"com.example.app\")${RESET}"
add_line "${GRAY}  └  ${GREEN}✓${RESET}${GRAY} App launched${RESET}"

# More steps...

# Summary
add_line ""
add_line "Successfully completed the task!"

# Show footer
show_footer
```

## Available Helper Functions

### `show_header <prompt>`
Shows the user prompt header at the top of the demo.

### `show_thinking`
Shows the "Demoing..." thinking animation.

### `show_footer`
Shows the final ready prompt at the bottom.

### `add_line <text>`
Adds a line of text with a small delay for animation.

### `replace_prev_line <text>`
Replaces the previous line (useful for showing completion status).

### `call_mcp_tool <tool_name> [args...]`
Calls an AutoMobile MCP tool silently in the background.

## Color Variables

- `$BLUE` - Blue text
- `$GREEN` - Green text (success)
- `$YELLOW` - Yellow text (prompts)
- `$GRAY` - Gray text (secondary info)
- `$RESET` - Reset to default
- `$BOLD` - Bold text

## Running a Scenario

```bash
# Run the demo recorder with your scenario
./demo/scripts/record-demo.sh <scenario-name>

# Example:
./demo/scripts/record-demo.sh clock-app
```

## Available Scenarios

- **clock-app** - Set a 6:30 AM alarm in the Clock app
- **slack-status** - Set Slack status to "Out sick" with expiration date (January 17th)
- **youtube-search** - Search for a video on YouTube mobile web and open it
