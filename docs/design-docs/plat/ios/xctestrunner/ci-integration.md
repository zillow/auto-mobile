# CI Integration

This page covers running AutoMobile XCTestRunner tests in GitHub Actions using a macOS runner with
a built-in iOS Simulator. The `automobile-tests` job shown here is the reference workflow used in
the `ios-build` repository.

## Overview

AutoMobile tests need:

1. A **pre-built `.xctestrun`** containing the `YourAppAutoMobileTests` bundle
2. A **booted iOS Simulator** on the runner
3. A **running AutoMobile daemon** reachable over the Unix socket
4. The **CtrlProxy iOS app** installed in the simulator

The sections below walk through each step.

!!! note "No cloud device service required"
    Unlike Android — which uses [emulator.wtf](https://emulator.wtf) to provision managed cloud
    emulators — iOS AutoMobile tests run on the macOS runner's built-in iOS Simulator. No external
    device service or additional secrets are needed.

## Job structure

The reference workflow splits testing into two independent jobs that share the same build artifact:

```
build-for-testing ──┬──► simulator-tests      (unit tests, skips AutoMobile bundle)
                    └──► automobile-tests      (AutoMobile tests only)
```

Both jobs download the same `.xctestrun` artifact from `build-for-testing` and run
`xcodebuild test-without-building` with different filtering flags, so there is no duplicate
compilation.

## Full workflow job

```yaml
automobile-tests:
  name: "AutoMobile XCTestRunner Tests"
  runs-on: macos-26
  needs: [build-for-testing]
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v6

    - name: Select Xcode 26.2
      uses: maxim-lobanov/setup-xcode@v1
      with:
        xcode-version: "26.2"

    - name: Setup Bun
      uses: oven-sh/setup-bun@v2

    - name: Install auto-mobile CLI
      run: bun install -g @kaeawc/auto-mobile

    - name: Ensure iOS Simulator runtime
      uses: ./.github/actions/ensure-ios-simulator-runtime

    - name: Download build products
      uses: actions/download-artifact@v7
      with:
        name: build-for-testing-macos-26
        path: build/DerivedData/Build/Products/

    - name: Boot iOS Simulator
      run: bash scripts/ios/boot-simulator.sh

    - name: Start simulator log stream
      run: |
        mkdir -p build
        xcrun simctl spawn booted log stream \
          --level debug --style compact --color none \
          --predicate 'subsystem BEGINSWITH "com.example.ios"' \
          > build/automobile-simulator.log 2>&1 &
        echo "LOG_STREAM_PID=$!" >> "$GITHUB_ENV"

    - name: Start AutoMobile daemon
      run: |
        auto-mobile --daemon start &
        echo "AUTOMOBILE_DAEMON_PID=$!" >> "$GITHUB_ENV"

    - name: Wait for daemon and register simulator
      run: auto-mobile --cli observe --platform ios

    - name: Run AutoMobile tests
      run: bash scripts/ios/xcode-automobile-tests.sh

    - name: Stop AutoMobile daemon
      if: always()
      run: kill "$AUTOMOBILE_DAEMON_PID" 2>/dev/null || true

    - name: Stop simulator log stream
      if: always()
      run: kill "$LOG_STREAM_PID" 2>/dev/null || true

    - name: Upload test results
      uses: actions/upload-artifact@v6
      if: always()
      with:
        name: automobile-test-results
        path: build/automobile-tests.xcresult
        retention-days: 7

    - name: Upload simulator logs on failure
      uses: actions/upload-artifact@v6
      if: failure()
      with:
        name: automobile-simulator-logs
        path: build/automobile-simulator.log
        retention-days: 7
```

## Step-by-step breakdown

### 1. Bun and auto-mobile

The daemon is a Node/Bun application. `setup-bun` ensures the Bun runtime is available on the
runner so `auto-mobile --daemon start` works correctly.

```yaml
- uses: oven-sh/setup-bun@v2
- run: bun install -g @kaeawc/auto-mobile
```

### 2. Build products artifact

AutoMobile tests run `test-without-building` against the `.xctestrun` produced by the
`build-for-testing` job. Downloading the artifact avoids recompiling on the test runner:

```yaml
- uses: actions/download-artifact@v7
  with:
    name: build-for-testing-macos-26
    path: build/DerivedData/Build/Products/
```

The artifact contains both test bundles (`YourAppTests.xctest` and
`YourAppAutoMobileTests.xctest`) and a `.xctestrun` file that references them.

### 3. Boot the simulator

```bash
bash scripts/ios/boot-simulator.sh
```

The helper script finds the simulator that matches the current Xcode SDK, creates it if missing,
and boots it. Alternatively:

```bash
xcrun simctl boot "iPhone 16"
open -a Simulator
xcrun simctl list devices booted   # confirm it booted
```

### 4. Daemon startup

Start the daemon in the background and save its PID for clean shutdown:

```bash
auto-mobile --daemon start &
echo "AUTOMOBILE_DAEMON_PID=$!" >> "$GITHUB_ENV"
```

The `--cli observe` step below implicitly waits for the daemon to be ready, so no explicit socket
poll is needed here.

### 5. CtrlProxy pre-installation

```bash
auto-mobile --cli observe --platform ios
```

This step does two things:

1. **Waits** for the daemon socket to become available (blocks until the daemon is up).
2. **Installs** the CtrlProxy iOS app into the booted simulator if it is not already present, so
   the first `observe` step in a test plan does not pay the installation cost.

Running this once before the test task ensures CtrlProxy is ready before `observe` steps in test
plans execute.

### 6. Run AutoMobile tests

```bash
bash scripts/ios/xcode-automobile-tests.sh
```

The script finds the `.xctestrun`, identifies the booted simulator, and runs:

```bash
xcodebuild test-without-building \
  -xctestrun "$xctestrun_file" \
  -destination "platform=iOS Simulator,id=$booted_udid" \
  -only-testing:YourAppAutoMobileTests \
  -enableCodeCoverage NO \
  -skipMacroValidation
```

`-only-testing:YourAppAutoMobileTests` limits execution to the AutoMobile bundle. Unit tests in
`YourAppTests` are handled by the separate `simulator-tests` job.

### 7. Cleanup

The `if: always()` guards ensure cleanup runs even when tests fail:

```bash
kill "$AUTOMOBILE_DAEMON_PID" 2>/dev/null || true
kill "$LOG_STREAM_PID" 2>/dev/null || true
```

The daemon process exits cleanly; the simulator remains booted for the remainder of the runner's
lifetime (macOS runners are ephemeral so no explicit teardown is needed).

### 8. Artifacts

| Artifact | When uploaded | Contents |
|---|---|---|
| `automobile-test-results` | Always | `build/automobile-tests.xcresult` — pass/fail, timing, screenshots |
| `automobile-simulator-logs` | On failure | `build/automobile-simulator.log` — simulator log stream filtered to your app's subsystem |

## Keeping unit tests and AutoMobile tests separate

The `simulator-tests` job runs unit tests using `-skip-testing:YourAppAutoMobileTests`:

```bash
# scripts/ios/xcode-test-without-building.sh
xcodebuild test-without-building \
  -xctestrun "$xctestrun_file" \
  -destination "platform=iOS Simulator,id=$booted_udid" \
  -skip-testing:YourAppAutoMobileTests \   # ← excludes AutoMobile bundle
  -enableCodeCoverage NO \
  -parallel-testing-enabled YES \
  -skipMacroValidation
```

The `automobile-tests` job runs the complement using `-only-testing:YourAppAutoMobileTests`.
This mirrors the Android pattern where `testDebugUnitTest -PexcludeAutoMobileTests` runs unit tests
and `testDebugUnitTest --tests '*.automobiletest.*'` runs the AutoMobile tests.

## Caching strategy

The `build-for-testing` job uses two cache layers that the `automobile-tests` job benefits from
indirectly through the artifact:

| Cache | Key | What it stores |
|---|---|---|
| SPM packages | `runner-xcode<ver>-spm-<hash(project.yml)>` | Alamofire, XCTestRunner, etc. — avoids re-cloning |
| DerivedData intermediates | `runner-xcode<ver>-intermediates-<hash(sources+configs)>` | Compiled `.o` and `.swiftmodule` files — makes incremental builds fast |

Both caches are keyed so a clean rebuild only triggers when sources actually change.

## Required secrets

No additional secrets are required for a basic AutoMobile test run. The macOS runner has Xcode
and iOS Simulator built in, and the daemon communicates entirely over a local Unix socket.

If you add features that require external services (e.g., a staging backend with an API key), pass
them as environment variables through the test scheme:

```yaml
- name: Run AutoMobile tests
  env:
    AUTOMOBILE_TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
  run: bash scripts/ios/xcode-automobile-tests.sh
```

Resolve them in the plan via parameter substitution (see
[Writing Tests → Plan parameters](writing-tests.md#plan-parameters)).

## Conditional execution

To skip the job on draft pull requests or when a specific label is absent:

```yaml
automobile-tests:
  if: github.event.pull_request.draft != true
```

## Reading results from CI

Download the `automobile-test-results` artifact and inspect with xcresulttool:

```bash
xcrun xcresulttool get test-results summary \
  --path automobile-tests.xcresult

xcrun xcresulttool get test-results tests \
  --path automobile-tests.xcresult --format json \
  | jq '[.. | objects | select(.testStatus? == "Failure") | .nodeIdentifier]'
```

## See also

- [Project Setup](project-setup.md) — Dependency, XcodeGen config, running locally
- [Writing Tests](writing-tests.md) — `AutoMobileTestCase` properties, YAML plan reference
- [CtrlProxy iOS](../ctrl-proxy-ios.md) — iOS automation server setup
