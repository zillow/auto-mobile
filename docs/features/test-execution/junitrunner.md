# Test Execution - JUnitRunner

Add this test Gradle dependency to all Android apps and libraries in your codebase. You can also add it only to the
modules that cover the UI you want to test.

```gradle
testImplementation("dev.jasonpearson.automobile:junit-runner:x.y.z")
```

The coordinates and current version are defined in `android/junit-runner/build.gradle.kts`.

To publish locally (for `~/.m2`) from the repo:

```bash
(cd android && ./gradlew :junit-runner:publishToMavenLocal)
```

Then replace `x.y.z` with the version from `android/junit-runner/build.gradle.kts`.

## Implementation references

- [`android/junit-runner/build.gradle.kts#L18-L58`](https://github.com/kaeawc/auto-mobile/blob/main/android/junit-runner/build.gradle.kts#L18-L58) for version and Maven coordinates.
