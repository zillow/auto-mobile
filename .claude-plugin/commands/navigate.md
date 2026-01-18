---
description: Navigate to a specific screen using the learned navigation graph
allowed-tools: mcp__auto-mobile__navigateTo, mcp__auto-mobile__observe, mcp__auto-mobile__explore, mcp__auto-mobile__getNavigationGraph, mcp__auto-mobile__launchApp, mcp__auto-mobile__homeScreen
---

Navigate to a target screen using previously learned navigation paths or by discovering new routes.

## Workflow

1. **Identify target**: Understand where the user wants to go:
   - Screen name (e.g., "Settings", "Profile", "Checkout")
   - Screen characteristics (e.g., "the screen with the search bar")
   - Feature location (e.g., "where I can change my password")

2. **Check navigation graph** using `getNavigationGraph` resource:
   - See if target screen is already known
   - Find existing paths from current location
   - Identify intermediate screens if needed

3. **Navigate using known paths**:
   - If path exists, use `navigateTo` with the screen name
   - AutoMobile will execute the learned sequence of actions
   - Verify arrival with `observe`

4. **If target not in graph**:
   - Start from a known location (home screen or app launch)
   - Use `explore` to discover paths to the target
   - Guide exploration toward likely areas

5. **Handle navigation failures**:
   - If `navigateTo` fails, observe current state
   - Determine if path is blocked (login required, feature disabled)
   - Try alternative routes if available
   - Fall back to manual step-by-step navigation

6. **Verify arrival**:
   - Use `observe` to confirm correct screen
   - Check for expected elements
   - Report success or mismatch

## Navigation Strategies

- **Direct**: Use `navigateTo` when path is known
- **Discovery**: Use `explore` to find new paths
- **Manual**: Step-by-step interaction for complex flows
- **Reset**: Go to `homeScreen` and start fresh if lost

## Parameters for navigateTo

- `screenName`: Target screen identifier
- `ensureOnScreen`: Verify arrival (default: true)
- `relaxedMatching`: Allow partial screen name matches
- `maxRetries`: Attempts before giving up

## Reporting

After navigation, report:
- Starting screen
- Path taken (screens traversed)
- Final destination
- Time taken
- Any obstacles encountered
