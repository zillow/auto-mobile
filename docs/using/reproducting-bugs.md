# Reproducing Bugs

Use AutoMobile to systematically reproduce bugs and create reproducible test cases.

**Example Prompt**

> We're reproducing a bug report for the <app-name\> <Android\iOS\> app. When you encounter a defect or notice something off, highlight it, especially if it will help reproduce the bug. If reproduced take a device snapshot to make further reproduction and debugging easier.
>
> <bug-report-details-here>

The agent will:

1. Attempt to find the relevant screen or behavior in the app
2. Reproduce any steps or context provided to approximate the state.
3. Draw [visual highlights](../design-docs/mcp/observe/visual-highlighting.md) around defects or important elements.
4. Take a [snapshot](../design-docs/mcp/storage/snapshots.md) of device state to be shared on other machines.

??? example "See demo: Bug reproduction"
    ![Bug reproduction workflow](../img/bug-repro.gif)
    *Demo: An AI agent reproducing a sample counter bug and [highlighting](../design-docs/mcp/observe/visual-highlighting.md) the main issue.*

**Best Practices**

- Include app state, user actions, expected vs actual behavior, stacktraces, any additional context.
- Document the environment by noting device, OS version, app version.
