# Overview

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** Fully implemented. All described fields (`viewHierarchy`, `screenSize`, `systemInsets`, `rotation`, `activeWindow`, `accessibilityAudit`, `performanceAudit`, etc.) are collected during observation. See the [Status Glossary](../../status-glossary.md) for chip definitions.

Each observation captures a snapshot of the current state of a device's screen and UI. When executed, it
collects multiple data points in parallel to minimize observation latency. These operations are incredibly platform
specific and will likely require a different ordering of steps per platform. All of this is to drive the
[interaction loop](../interaction-loop.md).

All collected data is assembled into an object containing (fields may be omitted when unavailable):

- `updatedAt`: device timestamp (or server timestamp fallback)
- `screenSize`: current screen dimensions (rotation-aware)
- `systemInsets`: UI insets for all screen edges
- `rotation`: current device rotation value
- `activeWindow`: current app/activity information when resolved
- `viewHierarchy`: complete UI hierarchy (if available)
- `focusedElement`: currently focused UI element (if any)
- `intentChooserDetected`: whether a system intent chooser is visible
- `wakefulness` and `backStack`: Android-specific state
- `perfTiming`, `displayedTimeMetrics` (Android launchApp "Displayed" startup timings), `performanceAudit`, and `accessibilityAudit`: present when the relevant modes are enabled
- `error`: error messages encountered during observation

The observation gracefully handles various error conditions:

- Screen off or device locked states
- Missing accessibility service
- Network timeouts or ADB connection issues
- Partial failures (returns available data even if some operations fail)

Each error is captured in the result object without causing the entire observation to fail, ensuring maximum data
availability for automation workflows.

## See Also

- [Video Recording](video-recording.md) for setting up screen recording for later analysis.
- [Vision Fallback](vision-fallback.md) for how we fall back to LLM vision analysis when view hierarchy observation fails.
- [Visual Highlighting](visual-highlighting.md) for how we can draw on top of the observed app.