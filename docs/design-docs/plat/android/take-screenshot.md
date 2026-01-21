# takeScreenshot fallback

## Goal

Provide a screenshot tool that is explicitly a visual fallback when element
lookup fails. The tool should be gated by server-side checks so agents
cannot treat it as a primary discovery method.

## Proposed MCP tool

```typescript
takeScreenshot({
  reason: "element-not-found",
  context: {
    action: "tapOn",
    text: "Login"
  },
  preferReuse: true
})
```

Key semantics:

- `reason` must be `element-not-found`.
- Server issues a short-lived "fallback ticket" after a not-found failure;
  `takeScreenshot` consumes it. Calls without a ticket fail.
- `preferReuse` reuses the most recent `observe` screenshot if it is fresh
  (e.g., under 250ms) to avoid another capture.

## Android implementation

Preferred capture path (fast, no temp file):

- `adb -s <device> exec-out screencap -p`

Fallback path (older devices/emulators):

- `adb -s <device> shell screencap -p /sdcard/automobile/s.png`
- `adb -s <device> pull /sdcard/automobile/s.png <out>`

Notes:

- API 29/35 emulators support `exec-out` reliably; keep the file-based path
  as a compatibility fallback.
- If AccessibilityService already delivered a screenshot in the last N ms,
  reuse it and return `reused: true` to keep the tool cheap.

## Plan

1. Add MCP tool metadata and server-side gating (fallback ticket).
2. Reuse recent `observe` screenshots when available.
3. Add a `reused` flag to the response for agent transparency.

## Risks

- Agents can still call the tool after a legitimate not-found, but server
  gating prevents general misuse.
- If `observe` is not delivering screenshots, fallback costs increase.
