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
2. Take a snapshot of device state using the [takeDeviceSnapshot]() MCP tool call.
2. Reproduce any steps or context provided to approximate the state.

Once a bug is reproduced, you can create an [automated test](ui-tests.md).

## Debugging Workflow

1. Verify the bug exists
2. Capture exact steps and device state
3. Create automated regression test
4. Confirm the fix resolves the issue

## Best Practices

- Include app state, user actions, expected vs actual behavior, stacktraces, any additional context.
- Isolate variables by testing one thing at a time.
- Document the environment by noting device, OS version, app version.
