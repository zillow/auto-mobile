# Project Setup

This page covers everything needed to integrate the AutoMobile JUnitRunner into an existing Android
Gradle project: adding the dependency, configuring Gradle, installing prerequisites, and running your
first test locally.

## Dependency

The runner is published to Maven Central. Add it as a `testImplementation` dependency in any Android
module whose UI you want to test.

=== "Version Catalog (recommended)"
    ```toml
    # gradle/libs.versions.toml
    [versions]
    auto-mobile-junit-runner = "0.0.13"

    [libraries]
    auto-mobile-junit-runner = { module = "dev.jasonpearson.auto-mobile:auto-mobile-junit-runner", version.ref = "auto-mobile-junit-runner" }
    ```

    ```kotlin
    // app/build.gradle.kts
    dependencies {
        testImplementation(libs.auto.mobile.junit.runner)
    }
    ```

=== "Direct coordinate"
    ```kotlin
    // app/build.gradle.kts
    dependencies {
        testImplementation("dev.jasonpearson.auto-mobile:auto-mobile-junit-runner:0.0.13")
    }
    ```

### Using a SNAPSHOT build

If you need unreleased features or are iterating on the runner itself, publish the module locally and
reference it from `mavenLocal()`.

```bash
# Inside the auto-mobile repo
cd android
./gradlew :junit-runner:publishToMavenLocal
./gradlew :test-plan-validation:publishToMavenLocal
```

Then add `mavenLocal()` **before** the other repositories in your project's
`settings.gradle.kts`:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        mavenLocal()   // must come first for SNAPSHOT resolution
        google()
        mavenCentral()
    }
}
```

And update the version:

```toml
# gradle/libs.versions.toml
auto-mobile-junit-runner = "0.0.13-SNAPSHOT"
```

!!! warning "SNAPSHOT transitive dependency"
    The `auto-mobile-junit-runner` POM references `auto-mobile-test-plan-validation` as a transitive
    dependency. When using SNAPSHOTs both must be published to mavenLocal together. The Maven Central
    release only carries stable versions — do not mix `mavenLocal()` versions with the Maven Central
    release.

## Gradle test task configuration

For most projects no Gradle configuration is needed — the runner auto-starts a daemon and
auto-downloads CtrlProxy on first use. The block below is only needed if you want to point the
daemon at a **locally-built CtrlProxy APK** (e.g., during active development of the accessibility
service or on a network with no GitHub Releases access).

```kotlin
// app/build.gradle.kts
val autoMobileCtrlProxyApkPath =
    providers.environmentVariable("AUTOMOBILE_CTRL_PROXY_APK_PATH")

tasks.withType<Test>().configureEach {
    // Pass the CtrlProxy APK path to the test process when provided.
    // The daemon uses this to install the accessibility service if it is missing.
    autoMobileCtrlProxyApkPath.orNull?.let { apkPath ->
        environment("AUTOMOBILE_CTRL_PROXY_APK_PATH", apkPath)
        systemProperty("automobile.ctrl.proxy.apk.path", apkPath)
    }
}
```

!!! note "Configuration cache compatibility"
    Use `providers.environmentVariable(...)` instead of reading `System.getenv()` directly so the
    Gradle configuration cache can store the task correctly. Calling `.orNull` at task execution time
    is safe; calling it during configuration will cause a cache miss on every build.

### Optional: pass additional tuning properties

```kotlin
tasks.withType<Test>().configureEach {
    // Timeout for the daemon to start (ms). Default: 10 000 ms.
    systemProperty("automobile.daemon.startup.timeout.ms", "15000")

    // Ordering strategy: auto | duration-asc | duration-desc | none
    systemProperty("automobile.junit.timing.ordering", "auto")
}
```

## Prerequisites

### ADB

`adb` must be on `PATH` or `ANDROID_HOME` must be set so the daemon can locate the SDK
platform-tools.

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS typical path
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Verify connectivity:

```bash
adb devices
# List of devices attached
# emulator-5554   device
```

### AutoMobile daemon

The JUnitRunner communicates with a locally running AutoMobile daemon over a Unix domain socket at
`/tmp/auto-mobile-daemon-<uid>.sock`. If no daemon is running when the first test starts, the runner
bootstraps one automatically using `bunx @kaeawc/auto-mobile@latest --daemon start`.

For predictable local development, start the daemon yourself so you can control its lifetime and
configuration:

```bash
bun add -g @kaeawc/auto-mobile
auto-mobile --daemon-mode &
```

Or if you have the auto-mobile repository checked out locally:

```bash
cd ~/path/to/auto-mobile
bun dist/src/index.js --daemon-mode &
```

!!! tip "Starting the daemon from the source directory"
    When using a local checkout, start the daemon from the repository root so that the daemon's
    working directory is the project root. This ensures schema files in `schemas/` are resolved
    correctly relative to `process.cwd()`.

### CtrlProxy (Accessibility Service)

The daemon needs the AutoMobile CtrlProxy APK installed on the device for view hierarchy access
during `observe` and interaction steps. The daemon auto-downloads it from GitHub Releases on first
use.

If the release APK is unavailable (e.g., during active development), build it locally:

```bash
cd ~/path/to/auto-mobile/android
./gradlew :control-proxy:assembleDebug
# Output: android/control-proxy/build/outputs/apk/debug/control-proxy-debug.apk
```

Then point the daemon to it:

```bash
export AUTOMOBILE_CTRL_PROXY_APK_PATH=/path/to/control-proxy-debug.apk
```

Pre-install the CtrlProxy before running tests using the CLI observe command:

```bash
auto-mobile --cli observe --platform android
```

This starts the daemon (if not already running) and installs the CtrlProxy on the connected device.

## Running tests locally

### Step 1 — Build and install the app APK

AutoMobile tests run against an already-installed app. Build the debug APK and install it:

```bash
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`terminateApp` and `launchApp` steps rely on the package being installed. If the APK is not
installed, `terminateApp` will fail even if `launchApp` appeared to succeed.

### Step 2 — Start the daemon

```bash
auto-mobile --daemon-mode &
```

Wait for the socket to appear before proceeding:

```bash
until [ -S "/tmp/auto-mobile-daemon-$(id -u).sock" ]; do sleep 1; done
echo "Daemon ready: /tmp/auto-mobile-daemon-$(id -u).sock"
```

### Step 3 — Run the tests

```bash
./gradlew :app:testDebugUnitTest --tests 'com.example.automobiletest.*'
```

Pass the CtrlProxy APK path when using a locally built APK:

```bash
AUTOMOBILE_CTRL_PROXY_APK_PATH=/path/to/control-proxy-debug.apk \
    ./gradlew :app:testDebugUnitTest --tests 'com.example.automobiletest.*'
```

### Watching test results

Test XML reports are written to:
```
app/build/test-results/testDebugUnitTest/
```

HTML report:
```
app/build/reports/tests/testDebugUnitTest/index.html
```

Verbose log files for each test execution are written to:
```
app/scratch/test-logs/
```

Each log file is named `<timestamp>_<TestClass>_<testMethod>.log` and contains the full daemon
response, performance metrics, stdout, and stderr for the test run.

## Multiple modules

If your project has more than one Android module with AutoMobile tests, add the dependency and
`tasks.withType<Test>` configuration to each module's `build.gradle.kts`. The daemon is shared
across all test workers on the host — you do not need to run multiple daemon instances.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `Could not resolve auto-mobile-junit-runner` | Missing `mavenLocal()` or wrong version | Ensure `mavenLocal()` is first in `settings.gradle.kts`; republish both SNAPSHOT modules |
| `Could not find test-plan.schema.json` | Daemon running old binary with path bug | Restart daemon from the auto-mobile source directory; verify the latest binary is installed |
| `Failed to terminate app: Command failed` | App APK not installed on device | Run `adb install -r app-debug.apk` before tests |
| `Daemon failed to start within Xms` | `bunx` unavailable or slow | Install `auto-mobile` globally and start the daemon manually before running tests |
| `No Android devices found — skipping` | `adb devices` shows no device | Start your emulator or connect a device; check `ANDROID_HOME` is set |

## See also

- [Writing Tests](writing-tests.md) — Annotation parameters, YAML plan authoring
- [CI Integration](ci-integration.md) — GitHub Actions, emulator.wtf ADB sessions
- [CtrlProxy](../control-proxy.md) — Accessibility service setup and version management
