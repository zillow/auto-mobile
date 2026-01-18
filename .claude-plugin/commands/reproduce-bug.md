---
description: Systematically reproduce a bug and document reproduction steps
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__inputText, mcp__auto-mobile__clearText, mcp__auto-mobile__selectAllText, mcp__auto-mobile__pressButton, mcp__auto-mobile__pinchOn, mcp__auto-mobile__dragAndDrop, mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp, mcp__auto-mobile__highlight, mcp__auto-mobile__deviceSnapshot, mcp__auto-mobile__homeScreen
---

Systematically reproduce a reported bug, document exact steps, and capture evidence.

## Workflow

1. **Understand the bug report**:
   - What is the expected behavior?
   - What is the actual behavior?
   - What conditions trigger it? (device, OS version, user state)
   - Any error messages or visual symptoms?

2. **Prepare environment**:
   - Capture initial device state with `deviceSnapshot` for restoration
   - Launch the app to a known starting point using `launchApp`
   - Use `observe` to verify starting screen

3. **Attempt reproduction** using interaction tools:
   - `tapOn` - tap, double-tap, long-press on elements
   - `swipeOn` - scroll, swipe, fling gestures
   - `inputText` - enter text into fields
   - `clearText` / `selectAllText` - manipulate existing text
   - `pressButton` - hardware buttons (back, home, menu)
   - `pinchOn` - zoom in/out gestures
   - `dragAndDrop` - drag elements between locations
   - Use `observe` frequently to verify screen state
   - Document each action taken

4. **When bug is reproduced**:
   - Use `highlight` to visually mark the defect on screen
   - Capture the final state with `observe`
   - Note exact sequence that triggered the issue

5. **Document findings**:
   - Exact reproduction steps (numbered list)
   - Environment details (device, OS, app version)
   - Expected vs actual behavior
   - Screenshots showing the issue
   - Any patterns (intermittent, specific conditions)

6. **If cannot reproduce**:
   - Document attempted steps
   - Note differences from reported environment
   - Suggest additional information needed
   - Try variations of the reported steps

7. **Cleanup**:
   - Use `terminateApp` to close the app
   - Restore device snapshot if needed

## Output Format

```markdown
## Bug Reproduction Report

**Bug**: [Brief description]
**Status**: Reproduced / Not Reproduced / Intermittent

### Environment
- Device: [model]
- OS: [version]
- App Version: [version]

### Reproduction Steps
1. [Step 1]
2. [Step 2]
...

### Expected Behavior
[Description]

### Actual Behavior
[Description]

### Evidence
- Screenshots: [attached/described]

### Notes
[Any additional observations]
```
