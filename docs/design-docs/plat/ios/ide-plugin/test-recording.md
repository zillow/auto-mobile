# Test Recording

The AutoMobile Xcode companion app can record interactions on an iOS simulator and
generate executable YAML plans. This mirrors the Android IDE plugin recording workflow
while adapting to Xcode constraints.

## Recording workflow

1. Attach to a running MCP server.
2. Select a simulator/device.
3. Click "Start Recording" in the companion app.
4. Perform interactions in the simulator.
5. Click "Stop Recording" to generate a plan.

## Captured data

- Tap, swipe, and text input actions.
- Element selectors (accessibility id, label, type).
- Screen context (view hierarchy signature, active app).
- Timing metadata for waits and transitions.

## Output

The companion app generates a YAML plan and opens it in Xcode using the Source Editor
Extension or a standard file open action.

## Execution

- The companion app can execute the plan via MCP.
- The Xcode extension can trigger plan execution for the active file.

## MCP integration

- The companion app requests recording start/stop over the daemon Unix socket.
- The MCP server publishes the latest plan as a resource and emits update notifications.
- The companion app listens for resource updates to load the recorded plan.

## See also

- [Xcode integration](overview.md)
- [MCP tool reference](../../../mcp/tools.md)
