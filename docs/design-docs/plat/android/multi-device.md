# Multi-device and critical sections

## Goal

Enable true parallel steps in `executePlan`, while supporting critical
sections where only one device can proceed at a time. Keep the plan format
close to the existing single-device test plans by adding a `device` key per
step and a simple `devices` list. Parallelism is implicit: top-level steps
for different devices run concurrently unless synchronized via
`criticalSection`.

## Proposed YAML extensions

Simple device labels, allocated by JUnitRunner/Daemon:

```
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

```
devices: ["A", "B"]

steps:
  - tool: launchApp
    device: A
    appId: com.chat.app
    label: Launch sender

  - tool: launchApp
    device: B
    appId: com.chat.app
    label: Launch receiver

  - tool: criticalSection
    lock: "chat-room"
    steps:
      - tool: inputText
        device: A
        text: "Hello"
        label: Type message
      - tool: imeAction
        device: A
        action: send
        label: Send message

  - tool: openSystemTray
    device: B
    lookFor: { text: "Hello" }
    timeoutMs: 5000
    label: Verify notification
```

YAML anchors (merge keys) should be supported for reuse and validation:

```
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
  one device at a time within the section.
- Optional `barrier` tool can synchronize devices without serializing actions.

## Android implementation

- Resolve label -> session routing in JUnitRunner/Daemon, not in the plan.
- Use a per-plan scheduler to track device tasks and locks.
- `criticalSection` waits until all devices reach the block before executing
  steps in a single-device sequence.
- Emit per-device timing metadata for debugging.
- Support YAML merge keys (`<<`) so anchors validate correctly.

## Plan

1. Add `devices` list and `device` routing key on steps.
2. Run top-level steps in parallel when device labels differ.
3. Add `criticalSection` tool support with a per-plan lock registry.
4. Support YAML anchors and merge keys in validation.

## Risks

- Parallel actions can cause ordering hazards without explicit locks.
- Timeouts need to be per-device to avoid deadlocks.
