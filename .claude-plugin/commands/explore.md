---
description: Explore an app to discover screens, features, and navigation paths
allowed-tools: mcp__auto-mobile__explore, mcp__auto-mobile__observe, mcp__auto-mobile__launchApp, mcp__auto-mobile__getNavigationGraph
---

Systematically explore a mobile app to understand its structure, discover screens, and build a navigation graph.

## Workflow

1. **Setup**: Ensure the target app is installed and launched using `launchApp`

2. **Start exploration** using the `explore` tool with appropriate strategy:
   - `breadth-first`: Cover more screens quickly (good for initial discovery)
   - `depth-first`: Explore each path thoroughly before backtracking
   - `random`: Discover unexpected paths and edge cases

3. **During exploration**, AutoMobile will:
   - Automatically interact with UI elements
   - Track visited screens and transitions
   - Build a navigation graph of the app
   - Capture screenshots and view hierarchies

4. **Review results** using `getNavigationGraph` resource:
   - List all discovered screens with their identifying elements
   - Show navigation paths between screens
   - Identify key interactive elements on each screen

5. **Report findings**:
   - Total screens discovered
   - Main user flows identified
   - Entry points and navigation patterns
   - Screens with forms, lists, or special functionality
   - Potential areas for deeper testing

## Use Cases

- **New app onboarding**: Quickly understand an unfamiliar app's structure
- **Test planning**: Identify screens and flows that need test coverage
- **Accessibility audit prep**: Find all screens to audit for accessibility
- **Documentation**: Generate app navigation documentation
- **Regression scope**: Understand what areas might be affected by changes

## Parameters

- `maxInteractions`: Limit exploration depth (default varies by strategy)
- `resetToHome`: Return to home screen periodically to explore different paths
- `resetInterval`: How often to reset (when resetToHome is enabled)
- `dryRun`: Preview what would be explored without making changes
