# Features - MCP Server - Visual Highlighting

Expose visual highlight overlays (box or circle) as an MCP tool for debugging UI layout and state.

## MCP Tool

- `highlight`
  - Params:
    - `action`: `add` | `remove` | `clear` | `list`
    - `highlightId`: required for `add` and `remove`
    - `shape`: required for `add`
    - `platform`: `android` | `ios`
    - Optional device targeting: `deviceId`, `device`, `sessionUuid`
    - Optional `timeoutMs` override
  - Returns: success flag, optional highlightId, list of highlights, and error message.
  - iOS: returns an unsupported error (Android only for now).

## Examples

### Highlight element during bug report
```javascript
await highlight({
  action: "add",
  highlightId: "problem-element",
  shape: {
    type: "box",
    bounds: { x: 100, y: 200, width: 300, height: 150 },
    style: { strokeColor: "#FF0000", strokeWidth: 3 }
  },
  platform: "android"
});
```

### Generate bug report with highlights
```javascript
await bugReport({
  platform: "android",
  includeScreenshot: true,
  highlights: [
    {
      id: "problem-area",
      description: "Expected button location",
      shape: {
        type: "box",
        bounds: { x: 120, y: 280, width: 220, height: 90 },
        style: { strokeColor: "#FF0000", strokeWidth: 6 }
      }
    }
  ],
  includeHighlightsInScreenshot: true,
  autoRemoveHighlights: true
});
```

### Multiple highlights for comparison
```javascript
await highlight({
  action: "add",
  highlightId: "expected",
  shape: {
    type: "circle",
    bounds: { x: 200, y: 300, width: 50, height: 50 },
    style: { strokeColor: "#00FF00", strokeWidth: 3 }
  },
  platform: "android"
});

await highlight({
  action: "add",
  highlightId: "actual",
  shape: {
    type: "circle",
    bounds: { x: 210, y: 310, width: 50, height: 50 },
    style: { strokeColor: "#FF0000", strokeWidth: 3 }
  },
  platform: "android"
});
```

### Clear after video recording
```javascript
await videoRecording({ action: "start", platform: "android" });
await highlight({ action: "add", highlightId: "focus", shape: {
  type: "box",
  bounds: { x: 80, y: 160, width: 260, height: 120 }
}, platform: "android" });
// ... perform actions ...
await videoRecording({ action: "stop", platform: "android" });
await highlight({ action: "clear", platform: "android" });
```

### List current highlights
```javascript
const result = await highlight({ action: "list", platform: "android" });
```

## Response Format

```typescript
{
  success: boolean;
  highlightId?: string;
  highlights?: Array<{ id: string; shape: HighlightShape }>;
  error?: string;
}
```
