---
description: Systematically reproduce a bug and document reproduction steps
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__highlight, mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp
---

Systematically reproduce a reported bug, document exact steps, and capture evidence.

## Available Skills

For device interactions during bug reproduction, use these skills:

- `/apps` - Launch and terminate apps
- `/system` - Navigate with hardware buttons, home screen
- `/gesture` - Tap, swipe, scroll to reproduce user actions
- `/text` - Input text, manipulate fields
- `/notifications` - Check notification-related bugs
- `/snapshot` - Capture device state for restoration

## Workflow

### 1. Understand the Bug Report

Gather information:
- What is the expected behavior?
- What is the actual behavior?
- What conditions trigger it? (device, OS version, user state)
- Any error messages or visual symptoms?

### 2. Prepare Environment

```
/snapshot capture "before_repro"  # Save initial state
/apps launch the target app
observe                           # Get initial screen state
```

Use `observe` at the start of a session to capture initial state. After that, interaction tools automatically return updated screen state.

### 3. Attempt Reproduction

Follow the reported steps using interaction skills:
- Use `/gesture` for taps, swipes, scrolls
- Use `/text` for text input
- Use `/system` for hardware button presses

Document each action taken and note any deviations. Only use `observe` if an action resulted in an incomplete or loading state that needs re-checking.

### 4. When Bug is Reproduced

```
highlight                         # Mark defect visually on screen
```

Record the exact sequence that triggered the issue. If the screen showed a loading state, use `observe` to capture the final state.

### 5. Document Findings

Create a structured report with:
- Exact reproduction steps (numbered list)
- Environment details (device, OS, app version)
- Expected vs actual behavior
- Screenshots showing the issue
- Any patterns (intermittent, specific conditions)

### 6. If Cannot Reproduce

- Document attempted steps
- Note differences from reported environment
- Suggest additional information needed
- Try variations of the reported steps

### 7. Cleanup

```
/apps terminate the app
/snapshot restore "before_repro"  # Restore initial state
```

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

## Tips

- Capture a snapshot before starting to enable easy state restoration
- Use `observe` only at session start or after loading/incomplete states
- Use `highlight` to visually mark the bug location on screen
- Document environment details early - they often matter for reproduction
- Try multiple devices/OS versions if bug doesn't reproduce
