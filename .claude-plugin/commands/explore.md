---
description: Explore an app to discover screens, features, and user flows
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp, mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__inputText, mcp__auto-mobile__clearText, mcp__auto-mobile__selectAllText, mcp__auto-mobile__pressButton, mcp__auto-mobile__pinchOn, mcp__auto-mobile__dragAndDrop, mcp__auto-mobile__homeScreen
---

Systematically explore a mobile app to understand its structure, discover screens, and map user flows.

## Workflow

1. **Setup**: Launch the target app using `launchApp`

2. **Observe initial state**: Use `observe` to capture the starting screen
   - Note the app package/bundle ID
   - Identify the current screen/activity
   - List visible interactive elements

3. **Systematic exploration**: Navigate through the app using interaction tools
   - `tapOn` to activate buttons, links, menu items
   - `swipeOn` to scroll lists and discover hidden content
   - `inputText` to fill forms and test input fields
   - `clearText` / `selectAllText` for text manipulation
   - `pressButton` for hardware buttons (back, home, menu)
   - `pinchOn` for zoom interactions
   - `dragAndDrop` for reorderable lists or drag targets

4. **Document each screen**:
   - Screen name/identifier
   - Key UI elements and their purposes
   - Navigation paths (how to reach this screen)
   - Interactive elements and their behaviors

5. **Map user flows**:
   - Identify primary user journeys
   - Note entry points and exit points
   - Document branching paths and conditional flows

6. **Report findings**:
   - Total screens discovered
   - Main user flows identified
   - Navigation patterns
   - Screens with forms, lists, or special functionality
   - Potential areas for deeper testing

## Use Cases

- **New app onboarding**: Quickly understand an unfamiliar app's structure
- **Test planning**: Identify screens and flows that need test coverage
- **Accessibility audit prep**: Find all screens to audit for accessibility
- **Documentation**: Generate app navigation documentation
- **Regression scope**: Understand what areas might be affected by changes

## Tips

- Use `pressButton` with "back" to navigate up the hierarchy
- Use `homeScreen` to reset and start fresh exploration paths
- Scroll to bottom of lists to discover all items
- Try long-press actions to find context menus
- Check different app states (logged in vs out, empty vs populated)
