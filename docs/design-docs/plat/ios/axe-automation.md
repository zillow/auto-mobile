# AXe Automation

The AXe automation layer coordinates touch injection and MCP tool execution for iOS.
It connects to the native iOS automation server for observations and uses
[AXe](https://github.com/cameroncooke/AXe) for input control.

## Responsibilities

- MCP protocol integration for iOS tool calls.
- WebSocket client to the iOS automation server.
- Touch and gesture injection via AXe.

## Parity goal

The AXe automation layer should provide feature parity with the Android toolset.
Implementation details may vary by platform, but the behavior and UX should be comparable.

## Touch injection strategy

1. Query element bounds from the iOS automation server.
2. Translate element coordinates to simulator window coordinates.
3. Inject mouse events using [AXe](https://github.com/cameroncooke/AXe).

## Deployment workflow

1. Build the iOS automation server app for the simulator.
2. Install and launch it on the target simulator.
3. Connect the MCP server WebSocket client.
4. Route MCP tool calls to the AXe automation layer.

## Distribution options

- Option A: bundle the automation server app with the MCP package.
- Option B: download the automation server app on first use and cache it under
  `~/.auto-mobile/ios-automation-server`.

## See also

- [iOS automation server](accessibility-service.md)
- [Xcode integration](ide-plugin/overview.md)
- [simctl integration](simctl.md)
