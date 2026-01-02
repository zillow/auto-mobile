# Speed Up CI by Capturing Accessibility Service Install in AVD Snapshot

## Overview
We currently install the accessibility service APK on every emulator run. This ensures correctness but adds time to each CI job. Investigate using an AVD snapshot that already has the accessibility service installed, so subsequent runs can restore the snapshot and skip installation.

## Goals
- Reduce emulator startup/setup time in CI.
- Keep the accessibility service reliably installed and enabled.
- Avoid flakiness when restoring snapshots.

## Proposed Approach
- During the AVD cache creation step, boot emulator, install and enable the accessibility service, then save a named snapshot.
- On future runs, restore that snapshot before running tests.
- Provide a fallback path that installs the APK if the snapshot restore fails or is unavailable.

## Considerations
- Snapshot compatibility across emulator versions and runner images.
- Ensure the service stays enabled after snapshot restore.
- Decide where to store snapshot metadata and how to invalidate when APK changes.

## Acceptance Criteria
- CI jobs restore a snapshot with the service installed (no explicit install step when snapshot is available).
- Emulator tests still pass in PR and merge workflows.
- Clear logging indicating whether snapshot restoration or fallback install was used.

## Notes
This is intentionally separate from the current "install on every run" approach. The snapshot path should be additive and safe to disable if it introduces instability.
