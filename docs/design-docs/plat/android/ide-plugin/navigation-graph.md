# Intellij IDE Plugin - Navigation Graph Render

## Goal

Render the current navigation graph inside the Android Studio plugin so
engineers can inspect app flow and validate navigation coverage without
leaving the IDE.

## UX

- Tool window tab: "Navigation Graph".
- Graph view with zoom/pan and node selection.
- Selected node shows:
  - Screen name
  - Last observed activity/package
  - Recent transitions (incoming/outgoing)
- Latest cached screenshot for the screen, if available.
- A refresh action to fetch the latest graph snapshot.

## Data sources

The MCP server streams navigation graph updates to the plugin. Nodes may
include an optional screenshot reference, exposed via navigation node
resources.

## Rendering pipeline

1. Subscribe to the server's navigation graph stream.
2. Normalize nodes/edges into a stable layout model.
3. Render via a lightweight graph UI (no per-frame allocations).
4. Keep a cached layout and only recompute on structural changes.

## Error handling

- If the graph is empty, show a "No navigation data yet" state.
- If the MCP server is unreachable, show a reconnect action with diagnostics.
- If parsing fails, log the raw payload and surface a brief error.

## Performance notes

- Defer layout work until the view is visible.
- Limit re-renders to changes in graph topology.
- Avoid blocking the UI thread on large graphs.

## See also

- [Navigation Graph](../../../mcp/nav/index.md)
- [IDE Plugin Overview](overview.md)
