# Test Execution - JUnitRunner

Add this test Gradle dependency to all Android apps and libraries in your codebase. You can also add it only to the
modules that cover the UI you want to test.

```gradle
testImplementation("dev.jasonpearson.automobile.junitrunner:x.y.z")
```

Note that this artifact hasn't been published to Maven Central just yet and is forthcoming.  


In the meantime, publish to your mavenLocal (`~/.m2`) via:

```
./gradlew publishToMavenLocal
```

and use the above testImplementation dependency with `x.y.z` version from `android/junit-runner/build.gradle.kts`.

## Historical Timing Data

The AutoMobile daemon exposes historical test timing summaries to the JUnitRunner via the
`getTestTimings` MCP tool. The runner fetches this data on startup (per JVM) and can optionally
use it to order tests based on historical duration. The default is `automobile.junit.timing.ordering=auto`,
which chooses longest-first when effective parallel forks are greater than 1 after device availability
is applied, and shortest-first otherwise. Set `automobile.junit.timing.ordering=none` to disable ordering,
or explicitly set `duration-desc` (longest-first) / `duration-asc` (shortest-first).

Timing fetch is automatically disabled when CI is detected (`automobile.ci.mode=true` or `CI=true`).

Example response format:

```json
{
  "testTimings": [
    {
      "testClass": "com.example.LoginTest",
      "testMethod": "testSuccessfulLogin",
      "averageDurationMs": 1250,
      "sampleSize": 15,
      "lastRun": "2026-01-05T12:00:00Z",
      "successRate": 0.93
    }
  ],
  "generatedAt": "2026-01-05T13:00:00Z",
  "totalTests": 150
}
```
