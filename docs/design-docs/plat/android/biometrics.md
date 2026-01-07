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

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Enrollment + auth steps (confirmed):

1. Set a device PIN (required for enrollment).
   - `adb -s <device> shell locksettings set-pin 1234`
2. Launch fingerprint enrollment.
   - `adb -s <device> shell am start -a android.settings.FINGERPRINT_ENROLL`
3. Enter PIN to continue.
   - `adb -s <device> shell input text 1234`
   - `adb -s <device> shell input keyevent 66`
4. Accept the consent screen ("I AGREE") via UI automation.
   - `adb -s <device> shell uiautomator dump /sdcard/fp_enroll.xml`
   - `adb -s <device> shell input tap <x> <y>`
5. At "Touch the sensor", simulate enrollment.
   - `adb -s <device> emu finger touch 1`
   - `adb -s <device> emu finger remove 1`
   - repeat until the UI shows "Fingerprint added"
6. Verify enrollment.
   - `adb -s <device> shell dumpsys fingerprint`
   - `adb -s <device> shell cmd fingerprint sync`
7. Validate unlock behavior on the lock screen.
   - `adb -s <device> shell input keyevent 26`
   - `adb -s <device> shell input keyevent 26`
   - `adb -s <device> emu finger touch 1`
   - `adb -s <device> emu finger remove 1`
   - `adb -s <device> shell dumpsys window | rg -n "isKeyguardShowing"`
   - `adb -s <device> shell input keyevent 26`
   - `adb -s <device> shell input keyevent 26`
   - `adb -s <device> emu finger touch 2`
   - `adb -s <device> emu finger remove 2`
   - `adb -s <device> shell dumpsys window | rg -n "isKeyguardShowing"`

Observed results:

- Enrollment completes after repeated touch/remove cycles and UI shows
  "Fingerprint added."
- `dumpsys fingerprint` reports one enrolled print:
  `prints:[{"id":0,"count":1,...}]`.
- `touch 1` unlocks the lock screen (`isKeyguardShowing=false`).
- `touch 2` does not unlock (`isKeyguardShowing=true`) when only print 1
  is enrolled.

Notes:

- `adb shell cmd biometric` has no shell implementation on API 35.
- `adb shell cmd fingerprint` exposes sync/fingerdown/notification only;
  enrollment still requires the Settings UI.

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
