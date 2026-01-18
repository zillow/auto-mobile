---
description: Capture current device state including screen, hierarchy, and app info
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__deviceSnapshot
---

Capture a comprehensive snapshot of the current device state for debugging, documentation, or state restoration.

## Workflow

1. **Capture screen state** using `observe`:
   - Current screen/activity name
   - Complete view hierarchy
   - Interactive elements with their properties
   - Screenshot of current display

2. **Analyze and report**:
   - **Active app**: Package name and current activity/view controller
   - **Screen title**: Identified from navigation bars or headers
   - **Key elements**: Buttons, inputs, lists, and their states
   - **Scrollable areas**: Content that extends beyond visible area
   - **Focused element**: Currently focused input or control

3. **Resource access** for additional context:
   - `automobile:observation/latest` - Full observation data
   - `automobile:observation/latest/screenshot` - Screen image
   - `automobile:devices/booted` - Device information
   - `automobile:apps` - Installed apps list

4. **Optional: Create restorable snapshot** with `deviceSnapshot`:
   - Capture app data for later restoration
   - Useful before destructive testing
   - Can include settings and preferences

## Output Summary

Report the captured state in a structured format:

```
## Device State Capture

**Device**: [name] ([platform] [version])
**App**: [package/bundle ID]
**Screen**: [activity/view controller name]
**Timestamp**: [ISO timestamp]

### Visible Elements
- [Element 1]: [type] - [text/description]
- [Element 2]: [type] - [text/description]
...

### Interactive Elements
- Buttons: [count] ([list of labels])
- Inputs: [count] ([list of hints/labels])
- Lists: [count]

### Screen State
- Keyboard: [visible/hidden]
- Orientation: [portrait/landscape]
- Scroll position: [top/middle/bottom or N/A]
```

## Use Cases

- **Debugging**: Understand current app state when issues occur
- **Documentation**: Capture screens for test reports or docs
- **State comparison**: Before/after captures for change verification
- **Handoff**: Share device state with team members
