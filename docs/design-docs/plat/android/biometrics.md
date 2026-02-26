# Biometrics Stubbing

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** The `biometricAuth` MCP tool is fully implemented and tested for Android emulators via `adb emu finger touch/remove`. Physical Android devices receive an SDK broadcast override (`supported: "partial"`). Face/iris modalities are not supported. The `AutoMobileBiometrics` SDK hook is <kbd>✅ Implemented</kbd>. See the [Status Glossary](../../status-glossary.md) for chip definitions.

## Goal

Allow tests and agents to trigger biometric success/failure/cancel on
emulators (API 29/35) and provide a path for app-under-test integration
when emulator support is not sufficient.

## MCP tool

```typescript
biometricAuth({
  action: "match" | "fail" | "cancel" | "error",
  modality: "any" | "fingerprint" | "face",
  fingerprintId?: number,
  errorCode?: number,   // BiometricPrompt.ERROR_* constant; used with action: "error"
  ttlMs?: number        // SDK override TTL in ms (default: 5000)
})
```

Behavior:

- `modality: any` prefers fingerprint on emulator (highest support).
- `action: match` — succeeds if enrollment exists.
- `action: fail` — simulates a non-matching biometric.
- `action: cancel` — simulates user cancellation via the SDK override.
- `action: error` — injects a hard `BiometricPrompt` error; requires SDK integration.

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

`AutoMobileBiometrics` is a debug-only SDK hook that makes biometric
authentication flows deterministic without physical hardware interaction.

### SDK API

```kotlin
// Initialize (called automatically by AutoMobileSDK.initialize):
AutoMobileBiometrics.initialize(applicationContext)

// Set an override (called by test code or triggered via MCP broadcast):
AutoMobileBiometrics.overrideResult(BiometricResult.Success, ttlMs = 5000L)
AutoMobileBiometrics.overrideResult(BiometricResult.Failure)
AutoMobileBiometrics.overrideResult(BiometricResult.Cancel)
AutoMobileBiometrics.overrideResult(BiometricResult.Error(errorCode = 7))

// Clear a pending override (call in @Before test setup):
AutoMobileBiometrics.clearOverride()

// Consume the override inside BiometricPrompt.AuthenticationCallback:
val override = AutoMobileBiometrics.consumeOverride()
```

### App integration pattern

Call `consumeOverride()` inside every branch of `BiometricPrompt.AuthenticationCallback`
before delegating to your real handler:

```kotlin
object : BiometricPrompt.AuthenticationCallback() {
    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        when (val override = AutoMobileBiometrics.consumeOverride()) {
            is BiometricResult.Failure -> handleFailure()
            is BiometricResult.Cancel  -> handleCancel()
            is BiometricResult.Error   -> handleError(override.errorCode, override.errorMessage)
            is BiometricResult.Success, null -> handleSuccess()
        }
    }
    override fun onAuthenticationFailed() {
        when (val override = AutoMobileBiometrics.consumeOverride()) {
            is BiometricResult.Success -> handleSuccess()
            is BiometricResult.Error   -> handleError(override.errorCode, override.errorMessage)
            is BiometricResult.Cancel  -> handleCancel()
            is BiometricResult.Failure, null -> handleFailure()
        }
    }
    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        when (val override = AutoMobileBiometrics.consumeOverride()) {
            is BiometricResult.Success -> handleSuccess()
            is BiometricResult.Failure -> handleFailure()
            is BiometricResult.Cancel  -> handleCancel()
            is BiometricResult.Error, null -> handleError(errorCode, errString.toString())
        }
    }
}
```

### How MCP-triggered overrides work

1. `biometricAuth` MCP tool sends `am broadcast` with override → SDK stores it.
2. MCP tool fires `adb emu finger touch 1` (emulator) to trigger the callback.
3. App calls `consumeOverride()` → override is consumed atomically, real result is swapped.

On physical devices, only the broadcast is sent (`supported: "partial"`). The override will
be applied when the biometric prompt fires normally.

### Override semantics

- The override is single-use: consumed by the first `consumeOverride()` call.
- Default TTL is 5000 ms; expired overrides are discarded.
- Call `clearOverride()` in `@Before` test setup to prevent stale state.

## Plan

1. ✅ Implement emulator fingerprint support via `adb emu finger`.
2. ✅ Add capability detection and clear error messages for unsupported devices.
3. ✅ Add optional SDK hook for deterministic app-under-test flows.

## Risks

- Emulator support is primarily fingerprint; face/iris is not consistent.
- Physical device support requires app SDK integration (`AutoMobileBiometrics.consumeOverride()`).
  The broadcast sets an override, but an actual biometric interaction is still needed to trigger
  the callback. There is no way to programmatically inject a touch event on physical hardware.
