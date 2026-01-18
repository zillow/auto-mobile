---
description: Systematically reproduce a bug and document reproduction steps
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__inputText, mcp__auto-mobile__launchApp, mcp__auto-mobile__highlight, mcp__auto-mobile__videoRecording, mcp__auto-mobile__deviceSnapshot
---

Systematically reproduce a reported bug, document exact steps, and capture evidence.

## Workflow

1. **Understand the bug report**:
   - What is the expected behavior?
   - What is the actual behavior?
   - What conditions trigger it? (device, OS version, user state)
   - Any error messages or visual symptoms?

2. **Prepare environment**:
   - Start video recording with `videoRecording` action: "start"
   - Capture initial device state with `deviceSnapshot` for restoration
   - Launch the app to a known starting point

3. **Attempt reproduction**:
   - Follow reported steps using interaction tools
   - Use `observe` frequently to verify screen state
   - Document each action taken
   - Note any deviations from expected behavior

4. **When bug is reproduced**:
   - Use `highlight` to visually mark the defect on screen
   - Capture the final state with `observe`
   - Stop video recording to preserve evidence

5. **Document findings**:
   - Exact reproduction steps (numbered list)
   - Environment details (device, OS, app version)
   - Expected vs actual behavior
   - Screenshots/video timestamps showing the issue
   - Any patterns (intermittent, specific conditions)

6. **If cannot reproduce**:
   - Document attempted steps
   - Note differences from reported environment
   - Suggest additional information needed
   - Try variations of the reported steps

7. **Create regression test** (optional):
   - Convert reproduction steps to a test plan
   - Add assertions that would catch this bug
   - Suggest where to add the test in the suite

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
- Video: [timestamp range]
- Screenshots: [attached]

### Notes
[Any additional observations]
```
