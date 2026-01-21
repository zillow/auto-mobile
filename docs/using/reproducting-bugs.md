# Reproducing Bugs

Use AutoMobile to systematically reproduce bugs and create reproducible test cases.

## Best Practices

- Include app state, user actions, expected vs actual behavior, stacktraces, any additional context.
- Document the environment by noting device, OS version, app version.

## Example

When you receive a bug report, ask your AI agent:

> Here is a bug report I'm trying to reproduce and provide specific steps for. When you encounter a defect or notice something off, highlight it, especially if it will help reproduce the bug. If reproduced take a device snapshot to make further reproduction and debugging easier.
>
> <bug-report-details-here>

The agent will:

1. Attempt to find the relevant screen or behavior in the app
2. Draw [visual highlights](../design-docs/mcp/observe/visual-highlighting.md) around defects or important elements.
2. Take a snapshot of device state using the [deviceSnapshot](../design-docs/mcp/storage/snapshots.md).
3. Reproduce any steps or context provided to approximate the state.

![Bug reproduction workflow](../img/bug-repro.gif)
*Demo: An AI agent reproducing a sample counter bug and [highlighting](../design-docs/mcp/observe/visual-highlighting.md) the main issue.*
