# Reproducing Bugs

Use AutoMobile to systematically reproduce bugs and create reproducible test cases.

![Bug reproduction workflow](../img/bug-repro.gif)

- Capture exact steps to reproduce bugs
- Generate test cases from bug reports
- Verify bug fixes
- Create regression tests

## From Bug Report to Test

When you receive a bug report, ask your AI agent:

> Here is a bug report I'm trying to reproduce and provide specific steps for. When you encounter a defect or notice something off, highlight it, especially if it will help reproduce the bug. If reproduced take a device snapshot to make further reproduction and debugging easier. /details

The agent will:

1. Attempt to find the relevant screen or behavior in the app
2. Draw [visual highlights](../design-docs/mcp/observe/visual-highlighting.md) around defects or important elements.
2. Take a snapshot of device state using the [deviceSnapshot](../design-docs/mcp/storage/snapshots.md).
3. Reproduce any steps or context provided to approximate the state.

Once a bug is reproduced, you can create an [automated test](ui-tests.md).


### Automate Reproduction Steps

Convert your bug reproduction steps into an automated test using [executePlan](../design-docs/mcp/tools.md#testing--debugging):

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
