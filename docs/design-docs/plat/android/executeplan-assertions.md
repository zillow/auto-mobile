# executePlan assertions

## Goal

Add native assertion and await steps to `executePlan`, with fail-fast
behavior by default and idling support from accessibility events.

## Proposed YAML extensions

```
- await:
    lookFor:
      text: "Logged in"
    timeoutMs: 5000
    idle: "a11y"

- assert:
    exists:
      resourceId: "com.app:id/error"
    shouldBe: false
```

Semantics:

- `await` polls until the selector matches or timeout occurs.
- `assert` fails immediately when the condition is not met.
- Default failure mode is hard fail (stop plan). JUnitRunner can wrap
  failures into test assertions if needed.

## Android implementation

Idle detection:

- Prefer AccessibilityService events (e.g., `WINDOW_CONTENT_CHANGED`).
- If no events arrive, fall back to polling `observe` at a low interval.

Selector resolution:

- Reuse existing element finding logic (text/resourceId/regex/class).
- The tool should return `lastObservationId` for debugging.

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Confirmed commands:

- Open Settings and dump UI:
  - `adb -s <device> shell am start -n com.android.settings/.Settings`
  - `adb -s <device> shell uiautomator dump /sdcard/settings_dump.xml`
  - `adb -s <device> shell cat /sdcard/settings_dump.xml`

Observed results:

- The UI dump contains stable text ("Settings") suitable for await/assert
  selectors.

## Plan

1. Extend executePlan schema to include `await` and `assert` steps.
2. Implement a11y-event idling with polling fallback.
3. Map failures to JUnitRunner assertions when invoked under JUnit.

## Risks

- Event-driven idling may miss transient states; use a min-hold duration.
- Polling too aggressively can increase device load.
