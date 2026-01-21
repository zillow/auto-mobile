# Control Feature Flags

## Goal

Provide a dedicated UI in the Xcode extension to view and toggle
AutoMobile feature flags without leaving the IDE.

## UX

- Menu bar extension: "Feature Flags".
- Table view with:
  - Flag key
  - Current value
  - Description (if provided)
  - Toggle control
- Search/filter by flag key.
- A refresh action to re-fetch from the daemon socket.

## Data sources

Use the AutoMobile daemon Unix socket (e.g., `/tmp/auto-mobile-daemon-<uid>.sock`)
to fetch and update feature flags. Avoid MCP tool calls for this surface.

## Behavior

- Load flags on extension open and on explicit refresh.
- Optimistically update the UI after a toggle, but roll back on error.
- If a flag is read-only, disable the toggle and show the reason.

## Error handling

- If the daemon socket is unavailable, show a reconnect state.
- If a toggle fails, show an alert with the error message and revert.

## Performance notes

- Cache the last fetched list and only diff updates when reloading.
- Debounce search input to avoid UI thrash.

## See also

- [Feature Flags](../../../mcp/feature-flags.md)
- [IDE Plugin Overview](overview.md)
