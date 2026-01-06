# UX Exploration with AutoMobile

Use AutoMobile with AI agents to interactively explore and understand your app's user experience.

## Overview

AutoMobile's exploration capabilities allow AI agents to:
- Navigate through your app autonomously
- Discover UI flows and interaction patterns
- Identify potential UX issues
- Build a navigation graph of your app's screens

## Basic Exploration

Ask your AI agent to explore your app:

```
Explore the main features of this app and identify the key user flows
```

The agent will:
1. Launch your app
2. Navigate through different screens
3. Interact with UI elements
4. Report findings and observations

## Navigation Graph

AutoMobile builds a navigation graph as it explores, tracking:
- Screen transitions
- User actions that trigger navigation
- UI elements that lead to each screen

See [Navigation Graph](../design-docs/mcp/navigation-graph.md) for technical details.

## Best Practices

- **Start with clear objectives**: Tell the agent what you're looking for
- **Set boundaries**: Specify areas to avoid (e.g., "don't submit forms")
- **Review findings**: The agent will report UX insights and potential issues

## Example Scenarios

- "Find all the ways to reach the settings screen"
- "Explore the onboarding flow and report any confusing steps"
- "Identify all screens that contain text input fields"
