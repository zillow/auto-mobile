# Extended accessibility testing

## Goal

Expose an MCP tool that runs fast a11y checks using the existing
AccessibilityService, with optional deeper checks via ATF.

## Proposed MCP tool

```
runA11yChecks({
  scope: "visible" | "screen",
  includeContrast: boolean,
  includeFocusOrder: boolean,
  minTapTargetDp: 48
})
```

Return structure should include:

- `violations`: array of rule IDs, node references, and summaries
- `supported`: per-rule capability flags

## Android implementation

Baseline checks (fast, AccessibilityService):

- Content description on image-only controls
- Minimum tap target size (dp -> px from density)
- Clickable without label
- Duplicate or ambiguous labels
- Focusability issues for editable text

Contrast checks:

- Use a recent screenshot and view bounds from AccessibilityNodeInfo.
- Sample foreground and background colors and compute WCAG contrast ratio.
- Flag nodes under a threshold (e.g., 4.5:1).

Optional ATF integration:

- Dependency: `com.google.android.apps.common.testing.accessibility:accessibility-test-framework`
- Use `AccessibilityCheckRunner.runChecks()` on the current node tree.
- Map ATF results into the MCP violation schema.

## Plan

1. Implement baseline heuristic rules using accessibility nodes.
2. Add contrast checks with screenshot sampling.
3. Add optional ATF integration behind a feature flag.

## Risks

- Contrast sampling can be noisy on transparent backgrounds.
- ATF may increase build size and dependency surface.
