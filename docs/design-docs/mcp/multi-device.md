# Multi-device

## Goal

Enable true parallel steps in `executePlan`, while supporting critical
sections where only one device can proceed at a time. Keep the plan format
close to the existing single-device test plans by adding a `device` key per
step and a simple `devices` list. Parallelism is implicit: top-level steps
for different devices run concurrently unless synchronized via
`criticalSection`.

## YAML Syntax

Simple device labels, allocated by JUnitRunner/Daemon:

```yaml
devices: ["A", "B"]

steps:
  - tool: launchApp
    device: A
    appId: com.chat.app
    label: Launch chat app (sender)

  - tool: launchApp
    device: B
    appId: com.chat.app
    label: Launch chat app (receiver)
```

Top-level steps remain consistent; parallelism is implicit:

```yaml
devices: ["A", "B"]

steps:
  - tool: launchApp
    params:
      device: A
      appId: com.chat.app
    label: Launch sender

  - tool: launchApp
    params:
      device: B
      appId: com.chat.app
    label: Launch receiver

  - tool: criticalSection
    params:
      lock: "chat-room"
      deviceCount: 2
      steps:
        - tool: inputText
          params:
            device: A
            text: "Hello"
          label: Type message
        - tool: imeAction
          params:
            device: A
            action: send
          label: Send message

  - tool: systemTray
    params:
      device: B
      action: find
      notification: { body: "Hello" }
      awaitTimeout: 5000
    label: Verify notification
```

YAML anchors (merge keys) are supported for reuse and validation:

```yaml
devices: ["A", "B"]

tap: &tap
  tool: tapOn
  action: tap

steps:
  - <<: *tap
    device: A
    id: "com.google.android.deskclock:id/tab_menu_alarm"
    label: Tap Alarm tab
  - <<: *tap
    device: B
    id: "com.google.android.deskclock:id/tab_menu_alarm"
    label: Tap Alarm tab
```

Semantics:

- `devices` is a list of labels to allocate sessions for; JUnitRunner requests
  the required number of devices from the MCP Daemon and maps them to labels.
- `device` on a step selects the label for routing.
- Steps targeting different devices run concurrently by default.
- `criticalSection` is a mutex; all devices must reach it, then steps execute
  one device at a time within the section. See [Critical Section](daemon/critical-section.md) for details.
- Optional `barrier` tool can synchronize devices without serializing actions.

## Implementation

### Plan Validation

Plans are validated at parse time:
- If `devices` field is present, all non-`criticalSection` steps must have a `device` parameter
- Device labels must be unique and non-empty strings
- Steps cannot reference undeclared device labels
- If any step uses device labels or criticalSection, the plan must declare `devices`

### Execution Model

**Sequential Mode (Single Device):**
- Plans without `devices` field execute sequentially as before
- Backward compatible with all existing plans

**Parallel Mode (Multi-Device):**
- Plan is partitioned into device tracks based on device labels
- Each device track executes independently in parallel
- Steps within a device maintain their relative order
- Both plan position and device track position are tracked for debugging

### Abort Strategy

Configurable behavior when a device fails:
- `immediate` (default): Abort all devices immediately
- `finish-current-step`: Let other devices finish their current step before aborting

### Per-Device Timing

Debug mode or failures log per-device execution timing:
```text
[PARALLEL_EXEC]   A: SUCCESS - 5/5 steps (1234ms)
[PARALLEL_EXEC]   B: FAILED - 3/5 steps (987ms)
[PARALLEL_EXEC]   B: Failed at plan step 7 (track step 2): Timeout waiting for element
```

## Known Limitations

- YAML anchors (`<<` merge keys) work but device labels must still be explicitly specified (not merged from anchors).
- Parallel actions can cause ordering hazards without explicit locks - use critical sections to synchronize.
- Each device's abort signal is checked between steps, not mid-step.
