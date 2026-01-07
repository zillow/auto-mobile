# simctl Integration

AutoMobile uses `simctl` for iOS simulator lifecycle and app management. This layer is
responsible for booting simulators, installing apps, launching processes, and controlling
system-level simulator behaviors that are not handled by AXe.

## Responsibilities

- Simulator lifecycle: boot, shutdown, erase.
- App lifecycle: install, uninstall, launch, terminate.
- Device discovery and capability reporting.
- Status bar configuration (demo mode) when supported.

## Usage patterns

- Prefer deterministic simulator selection by device identifier.
- Keep simulator state consistent between runs (reset/erase when needed).
- Use dedicated simulators for parallel test execution.

## Limitations

- macOS only (requires Xcode Command Line Tools).
- Simulator-only; physical devices are out of scope for simctl.

## See also

- [AXe automation](axe-automation.md)
- [iOS overview](index.md)
