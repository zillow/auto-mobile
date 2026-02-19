# Accessibility Bridge

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd> <kbd>📱 Simulator Only</kbd>

> **Current state:** `XCTestService` is a fully implemented Swift package (`ios/XCTestService/`) with WebSocket server, `ElementLocator`, `GesturePerformer`, `CommandHandler`, `HierarchyDebouncer`, and `DisplayLinkFPSMonitor`. Tests cover command handling, hierarchy debouncing, perf timing, and model serialization. Physical device support requires provisioning (issues [#912–914](https://github.com/jasonpearson/auto-mobile/issues/912)). See the [Status Glossary](../../status-glossary.md) for chip definitions.

The iOS automation server is a native iOS app that exposes the accessibility tree and element
queries over a WebSocket connection. It is the iOS counterpart to the Android accessibility
service and focuses on reliable observation delivery.

## Responsibilities

- Serve the accessibility tree via WebSocket.
- Support element lookup by id, text, and type.
- Provide element bounds for touch injection.
- Emit view hierarchy updates when the UI changes.
- Track first responder and focus state.

## WebSocket protocol

Client to server command:

```json
{
  "id": "cmd_abc123",
  "action": "getViewHierarchy",
  "params": {}
}
```

Server to client response:

```json
{
  "id": "cmd_abc123",
  "status": "success",
  "result": {
    "timestamp": 1704067200.5,
    "screenSize": { "width": 390, "height": 844 },
    "elements": [
      {
        "id": "UIButton_67890",
        "type": "UIButton",
        "label": "Submit",
        "identifier": "submitButton",
        "frame": { "x": 100, "y": 400, "width": 190, "height": 44 },
        "isEnabled": true,
        "isVisible": true,
        "traits": ["button"]
      }
    ]
  }
}
```

## Limitations

- Simulator-only currently.
- Physical device support requires provisioning (see GitHub issues #912-914).

## See also

- [XCTestService](xctestrunner.md) - Touch injection via native XCUITest APIs.
- [MCP tool reference](../../mcp/tools.md)
