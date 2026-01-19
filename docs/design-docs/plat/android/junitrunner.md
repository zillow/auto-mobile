# JUnitRunner

## Installation

Add this test Gradle dependency to all Android apps and libraries in your codebase. You can also add it only to the
modules that cover the UI you want to test.

```gradle
testImplementation("dev.jasonpearson.auto-mobile:auto-mobile-junit-runner:x.y.z")
```

This artifact is intended for Maven Central distribution. Use the latest release version once published.

For local development or testing unpublished changes, publish to your mavenLocal (`~/.m2`) via:

```
cd android
./gradlew :junit-runner:publishToMavenLocal
```

and use the above testImplementation dependency with the version from `android/junit-runner/build.gradle.kts`.

## Configuration

Configure the runner via system properties or environment variables:

```properties
# gradle.properties
automobile.ai.provider=anthropic
automobile.junit.timing.ordering=duration-desc
```

Set API keys via environment variables:
```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

Or via system property:
```bash
-Dautomobile.anthropic.api.key=your_api_key_here
```

Optional proxy endpoint:
```bash
-Dautomobile:your-proxy.example.com
```

## AI Recovery

The runner is designed to eventually support agentic self-healing capabilities, allowing tests to
automatically adapt and recover from common failure scenarios by leveraging AI-driven analysis of test failures and UI changes.

## Pooled Device Management

Multi-device support with emulator control and app lifecycle management. As long as you have available adb connections,
AutoMobile can automatically track which one its using for which execution plan or MCP session. CI still needs available
device connections, but AutoMobile handles selection and readiness checks. During STDIO MCP sessions,
🔧 [`setActiveDevice`](../../mcp/tools/index.md) is set once and reused for the session.

## Historical Timing Data

The AutoMobile daemon exposes historical test timing summaries to the JUnitRunner via the
`automobile:test-timings` MCP resource. The runner fetches this data on startup (per JVM) and can optionally
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

## Model Providers

The JUnitRunner supports OpenAI, Anthropic, Google Gemini, and AWS Bedrock for AI self-healing capabilities.

Configure via system property:
```properties
automobile.ai.provider=anthropic
```

For API key setup, see [Configuration](#configuration).

## CI/CD Integration

### Environment Variables

For CI environments, use environment-injected secrets:

```yaml
# GitHub Actions example
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  AUTOMOBILE_CI_MODE: true
```

### Gradle Configuration

```gradle
android {
    testOptions {
        unitTests.all {
            systemProperty "automobile.ai.provider", "anthropic"
            systemProperty "automobile.ci.mode", "true"
        }
    }
}
```

## Publishing (Manual)

1. Update `version` in `android/junit-runner/build.gradle.kts` to a release value (no `-SNAPSHOT`).
2. Ensure Maven Central credentials are available as Gradle properties (`mavenCentralUsername`,
   `mavenCentralPassword`). These can live in `~/.gradle/gradle.properties` or be provided via
   `ORG_GRADLE_PROJECT_` environment variables.
3. Ensure signing credentials are configured (for example `signingInMemoryKey` and
   `signingInMemoryKeyPassword`, or the `signing.*` Gradle properties).
4. From `android/`, run:

```
./gradlew :junit-runner:publishToMavenCentral
```

5. Release the deployment in https://central.sonatype.com (or run
   `./gradlew :junit-runner:publishAndReleaseToMavenCentral` to auto-release).

## Best Practices

1. **Use mavenLocal for local iteration** - Helpful for testing unpublished changes
2. **Enable the [Accessibility Service](accessibility-service.md)** - Required for real-time view hierarchy access
3. **Configure API keys securely** - Use environment variables in CI, avoid hardcoding
4. **Enable timing optimization** - Use historical timing data to order tests efficiently
5. **Monitor device pool** - Ensure enough devices are available for parallel execution
