# Project Setup

This page covers everything needed to integrate the AutoMobile XCTestRunner into an existing iOS
Xcode project: adding the dependency, configuring the test target, installing prerequisites, and
running your first test locally.

## Dependency

The XCTestRunner is a Swift Package Manager library. It can be consumed as a local path dependency
(for reproducibility before a GitHub release is available) or as a remote dependency once published.

### Local path dependency (current approach)

The recommended approach is to commit the XCTestRunner source alongside your project so CI can
resolve it without network access — analogous to how the Android JUnitRunner ships committed JARs
in `libs/maven/`.

**Step 1 — Copy the package source into your repo:**

```bash
# From your project root
mkdir -p libs/spm/XCTestRunner

# Copy from a local auto-mobile checkout
cp -r ~/path/to/auto-mobile/ios/XCTestRunner/Sources \
      libs/spm/XCTestRunner/Sources
```

**Step 2 — Create the package manifest:**

```swift
// libs/spm/XCTestRunner/Package.swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XCTestRunner",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(name: "XCTestRunner", targets: ["XCTestRunner"]),
    ],
    targets: [
        .target(name: "XCTestRunner", path: "Sources/XCTestRunner"),
    ]
)
```

**Step 3 — Commit both the manifest and the source files.** CI runners resolve them from disk with
no network dependency.

### Remote dependency (once published)

When the package is published to GitHub, switch to a version-pinned remote reference:

=== "XcodeGen"
    ```yaml
    # ios/YourApp/project.yml
    packages:
      XCTestRunner:
        url: https://github.com/kaeawc/auto-mobile
        from: "0.0.14"
    ```

=== "Package.swift"
    ```swift
    .package(url: "https://github.com/kaeawc/auto-mobile", from: "0.0.14")
    ```

### Using a local build from source

If you are developing the XCTestRunner itself and need to test against your local changes, point the
package at your checked-out source tree:

```yaml
# ios/YourApp/project.yml
packages:
  XCTestRunner:
    path: /path/to/auto-mobile/ios/XCTestRunner   # absolute path during development
```

!!! warning "Absolute paths are not portable"
    Absolute path references only work on your machine. Use a repo-relative path (e.g.
    `../../libs/spm/XCTestRunner`) for anything committed to source control so all team members
    and CI runners resolve the package correctly.

## Test target setup

### XcodeGen configuration

AutoMobile tests live in a dedicated test target separate from your unit tests. This keeps the
targets independent — unit tests can run without a simulator or daemon, while AutoMobile tests
require both.

```yaml
# ios/YourApp/project.yml
packages:
  # … existing packages …
  XCTestRunner:
    path: ../../libs/spm/XCTestRunner   # or remote URL once published

targets:
  YourApp:
    type: application
    # … existing app target …

  YourAppTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: Tests
        excludes:
          - AutoMobile/**       # keep AutoMobile files out of the unit test bundle
    dependencies:
      - target: YourApp
      # … existing test dependencies …

  YourAppAutoMobileTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: Tests/AutoMobile  # Swift files compiled; YAML files bundled as resources
    dependencies:
      - target: YourApp
      - package: XCTestRunner
        product: XCTestRunner
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.example.ios.YourAppAutoMobileTests

schemes:
  YourApp:
    build:
      targets:
        YourApp: all
        YourAppTests:
          - test
        YourAppAutoMobileTests:
          - test
    test:
      config: Debug
      parallelizeBuild: true
      enableCodeCoverage: false
      targets:
        - name: YourAppTests
        - name: YourAppAutoMobileTests
```

!!! note "Excluding AutoMobile files from unit tests"
    The `excludes: [AutoMobile/**]` entry in `YourAppTests` prevents the AutoMobile test Swift
    files from being compiled into the unit test bundle, where `XCTestRunner` is not linked.
    Without this exclusion the build fails with "no such module 'XCTestRunner'".

### Regenerate the Xcode project

```bash
cd ios/YourApp
xcodegen generate --spec project.yml
```

### Test plan resources

YAML plan files placed under `Tests/AutoMobile/` are automatically picked up by XcodeGen as
Copy Bundle Resources (`.yaml` is not a compiled source extension). They are bundled flat into
`YourAppAutoMobileTests.xctest`.

```
Tests/
└── AutoMobile/
    ├── AppLaunchAutoMobileTests.swift
    ├── AppLifecycleAutoMobileTests.swift
    └── test-plans/
        ├── launch-app.yaml
        └── app-background-foreground.yaml
```

The `AutoMobilePlanExecutor` resolves the `planPath` property first from the test bundle resources,
falling back to a filesystem path relative to the current working directory if the bundle lookup
fails. For a path like `"test-plans/launch-app.yaml"` the executor looks for `launch-app.yaml` in
the bundle's resource directory. Unique plan file names across the target are enough for reliable
resolution.

## Prerequisites

### Xcode and Command Line Tools

XCTestRunner requires Xcode 15.0+ on macOS 13.0+.

```bash
xcode-select --install   # installs Command Line Tools if missing
xcodebuild -version      # verify Xcode version
```

### iOS Simulator

Boot a simulator before running tests. The `scripts/ios/boot-simulator.sh` helper script in the
reference repo finds or creates an appropriate simulator and boots it:

```bash
bash scripts/ios/boot-simulator.sh
```

Or manually:

```bash
xcrun simctl boot "iPhone 16"
open -a Simulator
```

Verify the simulator is booted:

```bash
xcrun simctl list devices booted
```

### AutoMobile daemon

The XCTestRunner communicates with a locally running AutoMobile daemon over a Unix domain socket at
`/tmp/auto-mobile-daemon-<uid>.sock`. `DaemonManager.ensureDaemonRunning()` (called from
`setUpAutoMobile` in each test class) attempts to start the daemon automatically. For predictable
local development, start it yourself:

```bash
bun add -g @kaeawc/auto-mobile
auto-mobile --daemon start &
```

Or using bun:

```bash
bun install -g @kaeawc/auto-mobile
auto-mobile --daemon start &
```

Wait for the socket before proceeding:

```bash
until [ -S "/tmp/auto-mobile-daemon-$(id -u).sock" ]; do sleep 1; done
echo "Daemon ready"
```

### CtrlProxy iOS

The daemon needs the AutoMobile CtrlProxy app running inside the simulator for view hierarchy
access during `observe` and interaction steps. The daemon installs it automatically on first use.

Pre-install it before running tests using the CLI observe command to avoid installation delays
mid-test:

```bash
auto-mobile --cli observe --platform ios
```

This installs CtrlProxy into the booted simulator and confirms the daemon can reach it.

## Running tests locally

### Step 1 — Build for testing

```bash
bash scripts/ios/xcode-build-for-testing.sh
```

Or directly with xcodebuild:

```bash
xcodebuild build-for-testing \
  -scheme YourApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath build/DerivedData \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  -skipMacroValidation
```

The build produces a `.xctestrun` file in `build/DerivedData/Build/Products/` that captures both
`YourAppTests` and `YourAppAutoMobileTests`.

### Step 2 — Start the daemon

```bash
auto-mobile --daemon start &
until [ -S "/tmp/auto-mobile-daemon-$(id -u).sock" ]; do sleep 1; done
```

### Step 3 — Pre-install CtrlProxy

```bash
auto-mobile --cli observe --platform ios
```

### Step 4 — Run AutoMobile tests

```bash
bash scripts/ios/xcode-automobile-tests.sh
```

Or directly:

```bash
xctestrun_file=$(find build/DerivedData/Build/Products -name "*.xctestrun" | head -1)
booted_udid=$(xcrun simctl list devices booted -j \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['devices']; \
    print(next(v[0]['udid'] for v in d.values() if v), end='')" 2>/dev/null)

xcodebuild test-without-building \
  -xctestrun "$xctestrun_file" \
  -destination "platform=iOS Simulator,id=$booted_udid" \
  -only-testing:YourAppAutoMobileTests \
  -enableCodeCoverage NO \
  -skipMacroValidation
```

### Running unit tests separately

The standard test script skips the AutoMobile bundle so unit tests never require the daemon:

```bash
xcodebuild test-without-building \
  -xctestrun "$xctestrun_file" \
  -destination "platform=iOS Simulator,id=$booted_udid" \
  -skip-testing:YourAppAutoMobileTests \
  -enableCodeCoverage NO \
  -parallel-testing-enabled YES \
  -skipMacroValidation
```

### Reading test results

Test results are written as an `.xcresult` bundle:

```
build/automobile-tests.xcresult   # AutoMobile tests
build/test.xcresult               # unit tests
```

Inspect with the xcresulttool:

```bash
# Pass/fail summary
xcrun xcresulttool get test-results summary --path build/automobile-tests.xcresult

# All tests with status
xcrun xcresulttool get test-results tests --path build/automobile-tests.xcresult

# Extract failing test identifiers
xcrun xcresulttool get test-results tests \
  --path build/automobile-tests.xcresult --format json \
  | jq '[.. | objects | select(.testStatus? == "Failure") | .nodeIdentifier]'
```

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `no such module 'XCTestRunner'` | `YourAppTests` compiles AutoMobile files without the package linked | Add `excludes: [AutoMobile/**]` to `YourAppTests` sources in `project.yml`; regenerate |
| `AutoMobile daemon is not running and could not be started` | `auto-mobile` not on PATH or daemon failed to start | Install `@kaeawc/auto-mobile` globally; check PATH includes `~/.bun/bin` or `/usr/local/bin` |
| `Plan not found at path: test-plans/launch-app.yaml` | YAML file not bundled | Verify the YAML is under `Tests/AutoMobile/` and appears in Build Phases → Copy Bundle Resources |
| `No booted iPhone simulator found` | No simulator running | Run `bash scripts/ios/boot-simulator.sh` or `xcrun simctl boot "iPhone 16"` |
| `Missing AutoMobile test plan path.` | `planPath` returns empty string | Override `var planPath: String` in your test class |
| `Could not resolve package 'XCTestRunner'` | Local path wrong or source files missing | Verify `libs/spm/XCTestRunner/` exists and `Package.swift` references the correct `path` |

## See also

- [Writing Tests](writing-tests.md) — `AutoMobileTestCase` properties, YAML plan authoring
- [CI Integration](ci-integration.md) — GitHub Actions workflow
- [CtrlProxy iOS](../ctrl-proxy-ios.md) — iOS automation server setup
