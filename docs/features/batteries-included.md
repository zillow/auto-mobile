# Batteries Included

AutoMobile tries to reduce setup friction by detecting Android SDK components automatically, but it does **not**
download or configure the SDK for you. You still need to install the Android SDK/command-line tools yourself and make
`adb` available.

## Android SDK Detection

AutoMobile looks for SDK and command-line tools in common locations:

- `ANDROID_HOME` / `ANDROID_SDK_ROOT` (and `ANDROID_SDK_HOME` for `adb` fallback)
- Typical SDK paths per OS (macOS/Linux/Windows)
- Homebrew command-line tools path on macOS
- `PATH` (via `which`/`where` for `adb`)

## Manual Configuration

If detection fails, set the SDK path and ensure `adb` is on your `PATH`:

```bash
export ANDROID_HOME=/path/to/android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

## Implementation references

- [`src/utils/android-cmdline-tools/detection.ts#L82-L155`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/detection.ts#L82-L155) for SDK detection paths and PATH probing.
- [`src/utils/android-cmdline-tools/AdbClient.ts#L83-L124`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L83-L124) for `ANDROID_HOME`/`ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME` fallback logic.
- [`src/utils/android-cmdline-tools/install.ts#L11-L112`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/install.ts#L11-L112) noting that automatic SDK installation has been removed.
