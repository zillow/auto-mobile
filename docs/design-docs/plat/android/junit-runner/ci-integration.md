# CI Integration

This page covers running AutoMobile JUnit tests in GitHub Actions using an
[emulator.wtf](https://emulator.wtf) ADB session. The `auto-mobile-tests` job shown here is the
reference workflow used in this repository.

## Overview

AutoMobile tests need:

1. A **built and installed app APK** on a connected device
2. A **running AutoMobile daemon** reachable over the Unix socket
3. The **CtrlProxy accessibility service** installed on the device
4. A **Gradle test task** that can reach the daemon and the device via ADB

The sections below walk through each step.

## Full workflow job

```yaml
auto-mobile-tests:
  name: "AutoMobile JUnit Tests"
  runs-on: ubuntu-latest
  # Requires EW_API_TOKEN for the emulator.wtf ADB session.
  # Contact support@emulator.wtf to request access to start-session.
  if: github.secret_source == 'Actions'
  needs:
    - build-apk
  steps:
    - name: "Git Checkout"
      uses: actions/checkout@v4

    - name: "Setup Bun"
      uses: oven-sh/setup-bun@v2

    - name: "Install auto-mobile"
      shell: bash
      run: bun add -g @kaeawc/auto-mobile

    - name: "Download app APK"
      uses: actions/download-artifact@v4.1.8
      with:
        name: apk

    - name: "Install ew-cli"
      shell: bash
      run: |
        curl -fsSL \
          https://github.com/emulator-wtf/ew-cli/releases/latest/download/ew-cli-linux \
          -o /usr/local/bin/ew-cli
        chmod +x /usr/local/bin/ew-cli

    - name: "Start emulator.wtf ADB session"
      shell: bash
      env:
        EW_API_TOKEN: ${{ secrets.EW_API_TOKEN }}
      run: |
        ew-cli start-session \
          --device model=Pixel6,version=33,gpu=auto \
          --adb \
          --max-time-limit 20m &
        echo "EW_SESSION_PID=$!" >> "$GITHUB_ENV"
        adb wait-for-device
        adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'

    - name: "Install app APK on emulator"
      shell: bash
      run: adb install app-debug.apk

    - name: "Start auto-mobile daemon"
      shell: bash
      run: |
        auto-mobile --daemon-mode &
        echo "AUTOMOBILE_DAEMON_PID=$!" >> "$GITHUB_ENV"
        until [ -S "/tmp/auto-mobile-daemon-$(id -u).sock" ]; do sleep 1; done

    - name: "Pre-install CtrlProxy via observe"
      shell: bash
      run: auto-mobile --cli observe --platform android

    - name: "Install JDK"
      uses: actions/setup-java@v5
      with:
        distribution: zulu
        java-version: '21'

    - name: "Setup Gradle"
      uses: gradle/actions/setup-gradle@v4
      with:
        cache-encryption-key: ${{ secrets.GRADLE_ENCRYPTION_KEY }}
        cache-cleanup: on-success
        validate-wrappers: true

    - name: "Restore Android SDK cache"
      id: cache-android-sdk
      uses: actions/cache/restore@v4
      with:
        path: |
          ~/.android
          ~/.config
        key: v1-${{ runner.os }}-android-sdk

    - name: "Setup Android SDK"
      if: steps.cache-android-sdk.outputs.cache-hit != 'true'
      uses: android-actions/setup-android@v3

    - name: "Save Android SDK cache"
      if: steps.cache-android-sdk.outputs.cache-hit != 'true'
      uses: actions/cache/save@v4
      with:
        path: |
          ~/.android
          ~/.config
        key: v1-${{ runner.os }}-android-sdk

    - name: "Run AutoMobile JUnit Tests"
      shell: bash
      run: >-
        ./gradlew :app:testDebugUnitTest
        --tests 'com.example.automobiletest.*'
        --continue
        --stacktrace

    - name: "Stop emulator.wtf session and daemon"
      if: always()
      shell: bash
      run: |
        kill "$AUTOMOBILE_DAEMON_PID" 2>/dev/null || true
        kill "$EW_SESSION_PID" 2>/dev/null || true

    - name: "Publish Test Report"
      uses: mikepenz/action-junit-report@v4
      if: always()
      with:
        check_name: "AutoMobile Test Report"
        report_paths: 'app/build/test-results/**/*.xml'
```

## Step-by-step breakdown

### 1. Bun and auto-mobile

The daemon is a Node/Bun application. `setup-bun` ensures the Bun runtime is available on the
runner so that `auto-mobile --daemon-mode` works correctly.

```yaml
- uses: oven-sh/setup-bun@v2

- run: bun add -g @kaeawc/auto-mobile
```

Bun handles native dependencies automatically during installation.

### 2. emulator.wtf ADB session

The `start-session --adb` flag from [ew-cli](https://emulator.wtf/docs/ew-cli) provisions a
managed emulator and bridges its ADB connection to the runner's local ADB server, making the device
visible to all subsequent `adb` and `./gradlew` commands.

```bash
ew-cli start-session \
  --device model=Pixel6,version=33,gpu=auto \
  --adb \
  --max-time-limit 20m &
```

!!! note "Closed alpha feature"
    `start-session --adb` is a closed alpha feature. Contact
    [support@emulator.wtf](mailto:support@emulator.wtf) to request access.

After starting the session in the background, the step waits for the device to finish booting:

```bash
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
```

#### Device configuration options

| Flag | Example values | Notes |
|---|---|---|
| `model` | `Pixel6`, `Pixel9Pro`, `GalaxyS22` | Physical model to emulate |
| `version` | `30`–`35` | Android API level |
| `gpu` | `auto`, `swiftshader_indirect`, `host` | GPU rendering mode; `auto` picks the best available |
| `--max-time-limit` | `10m`, `20m`, `30m` | Hard session time limit; the session ends and billing stops after this |

### 3. App APK installation

AutoMobile tests run against an already-installed app. The APK is downloaded from a prior
`build-apk` job artifact and installed onto the emulator:

```yaml
- name: "Download app APK"
  uses: actions/download-artifact@v4.1.8
  with:
    name: apk

- name: "Install app APK on emulator"
  run: adb install app-debug.apk
```

### 4. Daemon startup

Start the daemon in the background and capture its PID so it can be cleanly shut down at the end:

```bash
auto-mobile --daemon-mode &
echo "AUTOMOBILE_DAEMON_PID=$!" >> "$GITHUB_ENV"
until [ -S "/tmp/auto-mobile-daemon-$(id -u).sock" ]; do sleep 1; done
```

The `until` loop polls for the Unix socket file instead of using a fixed sleep, so it proceeds as
soon as the daemon is ready regardless of machine speed.

### 5. CtrlProxy pre-installation

The `--cli observe` command instructs the daemon to take a screenshot and capture the accessibility
hierarchy. As a side effect it installs the CtrlProxy accessibility service APK if it is not already
present:

```bash
auto-mobile --cli observe --platform android
```

Running this once before the test task ensures the CtrlProxy is ready before `observe` steps in
test plans execute, avoiding installation delays mid-test.

### 6. Gradle test task

The reference workflow above uses an internal composite action. If you are setting this up in your
own repository, expand it to these steps:

```yaml
- name: "Install JDK"
  uses: actions/setup-java@v5
  with:
    distribution: zulu
    java-version: '21'

- name: "Setup Gradle"
  uses: gradle/actions/setup-gradle@v4
  with:
    cache-encryption-key: ${{ secrets.GRADLE_ENCRYPTION_KEY }}
    cache-cleanup: on-success
    validate-wrappers: true

- name: "Restore Android SDK cache"
  id: cache-android-sdk
  uses: actions/cache/restore@v4
  with:
    path: |
      ~/.android
      ~/.config
    key: v1-${{ runner.os }}-android-sdk

- name: "Setup Android SDK"
  if: steps.cache-android-sdk.outputs.cache-hit != 'true'
  uses: android-actions/setup-android@v3

- name: "Save Android SDK cache"
  if: steps.cache-android-sdk.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with:
    path: |
      ~/.android
      ~/.config
    key: v1-${{ runner.os }}-android-sdk

- name: "Run AutoMobile JUnit Tests"
  shell: bash
  run: >-
    ./gradlew :app:testDebugUnitTest
    --tests 'com.example.automobiletest.*'
    --continue
    --stacktrace
```

`gradle/actions/setup-gradle` handles Gradle wrapper caching and the build cache automatically.
Environment variables like `AUTOMOBILE_CTRL_PROXY_APK_PATH` are safe with the configuration cache
as long as they are declared via `providers.environmentVariable()` in your Gradle build — which is
exactly what the [Project Setup](project-setup.md#gradle-test-task-configuration) example does.
Gradle tracks the provider as a configuration input and invalidates the cache entry automatically
when the value changes.

### 7. Cleanup

The `if: always()` ensures cleanup runs even when tests fail:

```bash
kill "$AUTOMOBILE_DAEMON_PID" 2>/dev/null || true
kill "$EW_SESSION_PID" 2>/dev/null || true
```

Killing the `ew-cli` background process ends the emulator.wtf session and stops billing.

### 8. Test report publishing

```yaml
- uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    check_name: "AutoMobile Test Report"
    report_paths: 'app/build/test-results/**/*.xml'
```

The JUnit XML reports written to `app/build/test-results/` are picked up and published as a GitHub
check, making failures visible in the PR Checks tab.

## Required secrets

| Secret | Used by | How to obtain |
|---|---|---|
| `EW_API_TOKEN` | `ew-cli start-session` | [emulator.wtf dashboard](https://emulator.wtf) → API tokens |
| `GRADLE_ENCRYPTION_KEY` | Gradle configuration cache encryption | Generate a random 256-bit base64 key; store in repository secrets |

Set both secrets under **Settings → Secrets and variables → Actions** in your GitHub repository.

## Job dependencies

The `auto-mobile-tests` job should depend on `build-apk` so it downloads the APK artifact once it
is ready:

```yaml
needs:
  - build-apk
```

## Conditional execution

The `if: github.secret_source == 'Actions'` guard prevents the job from running on forks or for
pull requests from contributors who do not have access to repository secrets. This avoids spurious
failures when `EW_API_TOKEN` is unavailable.

To also skip on draft pull requests:

```yaml
if: github.secret_source == 'Actions' && github.event.pull_request.draft != true
```

## Running without emulator.wtf

If you have a self-hosted runner with an emulator already running, omit the `ew-cli` steps and
replace the `adb wait-for-device` block with a step that starts your emulator. Everything else
(daemon startup, CtrlProxy pre-install, Gradle task) remains the same.

```yaml
- name: "Start AVD emulator"
  uses: reactivecircus/android-emulator-runner@v2
  with:
    api-level: 33
    target: google_apis
    arch: x86_64
    profile: pixel_6
    script: |
      adb wait-for-device
      adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
```

## See also

- [Project Setup](project-setup.md) — Gradle config, SNAPSHOT dependency, local dev
- [Writing Tests](writing-tests.md) — `@AutoMobileTest` parameters, YAML plan reference
- [CtrlProxy](../control-proxy.md) — Accessibility service setup and version management
