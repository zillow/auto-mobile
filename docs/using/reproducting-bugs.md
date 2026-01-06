# Reproducing Bugs with AutoMobile

Use AutoMobile to systematically reproduce bugs and create reproducible test cases.

## Overview

AutoMobile helps you:
- Capture exact steps to reproduce bugs
- Generate test cases from bug reports
- Verify bug fixes
- Create regression tests

## From Bug Report to Test

When you receive a bug report, ask your AI agent:

```
Reproduce this bug: "App crashes when submitting a form with an empty email field"
```

The agent will:
1. Navigate to the form
2. Leave the email field empty
3. Submit the form
4. Observe and report the result

## Creating Reproducible Tests

Once a bug is reproduced, you can create an automated test:

```
Create a test case for this bug so we can verify it's fixed
```

See [UI Tests](ui-tests.md) for more on writing automated tests.

## Debugging Workflow

1. **Reproduce** - Verify the bug exists
2. **Document** - Capture exact steps and device state
3. **Test** - Create automated regression test
4. **Verify** - Confirm the fix resolves the issue

## Best Practices

- **Provide context**: Include app state, user actions, expected vs actual behavior
- **Isolate variables**: Test one thing at a time
- **Document environment**: Note device, OS version, app version
