# Reproducing Bugs with AutoMobile

Use AutoMobile to systematically reproduce bugs and create reproducible test cases.

- Capture exact steps to reproduce bugs
- Generate test cases from bug reports
- Verify bug fixes
- Create regression tests

## From Bug Report to Test

When you receive a bug report, ask your AI agent:

> Here is a bug report that a user reproduced in production. /details

The agent will:
1. Navigate to screen (if specified), otherwise it will attempt to find the behavior in the app
2. Take a snapshot of device state using the [deviceSnapshot](../features/snapshots.md#devicesnapshot) MCP tool call (`action: "capture"`).
3. Reproduce any steps or context provided to approximate the state.

Once a bug is reproduced, you can create an [automated test](ui-tests.md).

## Next Steps

After reproducing a bug, use these MCP tools to complete the workflow:

### Generate Bug Report

Use the [bugReport](../design-docs/mcp/actions.md#testing--debugging) tool to create a comprehensive bug report:

```javascript
await bugReport({
  description: "Login button not responding after network error"
});
```

This captures:
- Current screen state and view hierarchy
- Recent logcat entries
- Screenshot
- Device and app information

To capture a screenshot with visual highlights and include highlight metadata:

```javascript
await bugReport({
  includeScreenshot: true,
  highlights: [
    {
      description: "Login button not responding to taps",
      shape: {
        type: "box",
        bounds: { x: 100, y: 300, width: 200, height: 80 },
        style: { strokeColor: "#FF0000", strokeWidth: 6 }
      }
    }
  ],
  includeHighlightsInScreenshot: true
});
```

### Capture Reproduction Video with Highlights

Use `videoRecording` with highlight overlays to make reproduction videos self-explanatory.

**Pre-planned highlights:**

```javascript
await videoRecording({
  action: "start",
  platform: "android",
  highlights: [
    {
      description: "Where the button should be",
      shape: {
        type: "circle",
        bounds: { x: 120, y: 240, width: 80, height: 80 },
        style: { strokeColor: "#00FF00", strokeWidth: 4 }
      }
    },
    {
      description: "Where the button actually is",
      shape: {
        type: "circle",
        bounds: { x: 260, y: 260, width: 80, height: 80 },
        style: { strokeColor: "#FF0000", strokeWidth: 4 }
      }
    }
  ]
});

// Perform reproduction steps...
await tapOn({ action: "tap", text: "Login" });

await videoRecording({ action: "stop" });
```

**Dynamic highlights during recording:**

```javascript
await videoRecording({ action: "start", platform: "android" });

await tapOn({ action: "tap", text: "Settings" });

await highlight({
  shape: { type: "box", bounds: { x: 0, y: 500, width: 1080, height: 200 } },
  platform: "android"
});

await swipeOn({ direction: "down" });

await videoRecording({ action: "stop" });
```

### Automate Reproduction Steps

Convert your bug reproduction steps into an automated test using [executePlan](../design-docs/mcp/actions.md#testing--debugging):

```javascript
await executePlan({
  planContent: `
- launchApp: { packageName: "com.example.app" }
- tapOn: { contentDescription: "Login" }
- inputText: { text: "user@example.com" }
- tapOn: { text: "Submit" }
  `
});
```

This ensures the bug can be reliably reproduced and becomes a regression test once fixed.

## Debugging Workflow

1. Verify the bug exists
2. Capture exact steps and device state
3. Create automated regression test
4. Confirm the fix resolves the issue

## Best Practices

- Include app state, user actions, expected vs actual behavior, stacktraces, any additional context.
- Isolate variables by testing one thing at a time.
- Document the environment by noting device, OS version, app version.
