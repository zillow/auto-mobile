---
description: Capture and restore device state snapshots
allowed-tools: mcp__auto-mobile__deviceSnapshot
---

Capture and restore device state for testing isolation and reproducibility.

## Capture Snapshot

Save the current device state:
```
deviceSnapshot with action: "capture"
deviceSnapshot with action: "capture", snapshotName: "logged_in_state"
```

Options:
- `snapshotName`: Name for the snapshot (optional)
- `includeAppData`: Include app data in snapshot (default: true)
- `includeSettings`: Include device settings (default: false)

## Restore Snapshot

Restore a previously captured state:
```
deviceSnapshot with action: "restore"
deviceSnapshot with action: "restore", snapshotName: "logged_in_state"
```

## Use Cases

### Test Isolation
Capture state before each test, restore after:
```
deviceSnapshot "capture" → (run test) → deviceSnapshot "restore"
```

### Skip Repetitive Setup
Capture state after login, restore for each test:
```
(login flow) → deviceSnapshot "capture" name: "logged_in"
...
deviceSnapshot "restore" name: "logged_in" → (run test)
```

### Bug Reproduction
Capture state when bug occurs for later investigation:
```
(reproduce bug) → deviceSnapshot "capture" name: "bug_state"
```

### A/B Comparison
Capture baseline, make changes, compare:
```
deviceSnapshot "capture" name: "before"
(make changes)
deviceSnapshot "capture" name: "after"
```

## Tips

- Name snapshots descriptively for easy identification
- Capture snapshots at stable points (after app load, after login)
- Snapshots include app state but may not capture all system state
- Restore clears current state, so capture first if needed
- Use snapshots to speed up test setup by skipping repetitive flows
