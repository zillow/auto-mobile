# Biometrics stubbing (Android)

## Goal

Allow tests and agents to trigger biometric success/failure/cancel on
emulators (API 29/35) and provide a path for app-under-test integration
when emulator support is not sufficient.

## Proposed MCP tool

```
biometricAuth({
  action: "match" | "fail" | "cancel",
  modality: "any" | "fingerprint" | "face",
  fingerprintId?: number
})
```

Behavior:

- `modality: any` prefers fingerprint on emulator (highest support).
- `action: match` should succeed if enrollment exists.
- `action: fail` should simulate a non-matching biometric.

## Emulator implementation (API 29/35)

Primary mechanism (fingerprint):

- Enroll a fingerprint in Settings (one-time per emulator snapshot).
- Trigger match: `adb -s <device> emu finger touch <id>`
- Release sensor: `adb -s <device> emu finger remove <id>`

Failure simulation:

- Use a non-enrolled `<id>` to generate a mismatch when the prompt is active.
- If emulator does not differentiate ids, treat `fail` as `cancel` and return
  `supported: partial` with a reason.

Capability probing:

- `adb -s <device> shell getprop ro.kernel.qemu` (1 indicates emulator)
- `adb -s <device> emu help` to confirm `finger` commands are available

## App-under-test integration (AutoMobile SDK)

When emulator-only support is not enough, add a debug-only SDK hook to
bypass or simulate biometric callbacks within the app-under-test.

Suggested SDK entrypoint:

```
AutoMobileBiometrics.overrideResult(
  result = SUCCESS | FAILURE | CANCEL,
  ttlMs = 5000
)
```

Notes:

- This is a build-time opt-in for apps we can modify.
- It can bypass the system prompt to make tests deterministic.

## Plan

1. Implement emulator fingerprint support via `adb emu finger`.
2. Add capability detection and clear error messages for unsupported devices.
3. Add optional SDK hook for deterministic app-under-test flows.

## Risks

- Emulator support is primarily fingerprint; face/iris is not consistent.
- Physical devices may not allow simulation without device-owner privileges.
