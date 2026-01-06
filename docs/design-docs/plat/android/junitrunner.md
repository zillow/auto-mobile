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


#### AI Recovery

The runner is designed to eventually support agentic self-healing capabilities, allowing tests to
automatically adapt and recover from common failure scenarios by leveraging AI-driven analysis of test failures and UI changes.

#### Pooled Device Management

Multi-device support with emulator control and app lifecycle management. As long as you have available adb connections,
AutoMobile can automatically track which one its using for which execution plan or MCP session. CI still needs available
device connections, but AutoMobile handles selection and readiness checks. During STDIO MCP sessions the tool call `setActiveDevice` will be done and kept for the duration of your session.




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

# Model Providers

AutoMobile’s AI agent is bundled with the Android JUnitRunner. Provider selection and credentials are configured via
system properties or environment variables in the JUnitRunner process.

Supported providers:

- ✅ OpenAI
- ✅ Anthropic
- ✅ Google
- ✅ AWS Bedrock

## Common Configuration

Use the system property `automobile.ai.provider` to select a provider (`openai`, `anthropic`, `google`). The agent
reads provider-specific API keys from environment variables or `automobile.<provider>.api.key` system properties. An
optional proxy endpoint can be set with `automobile.ai.proxy.endpoint`.


In gradle.properties set `automobile.ai.provider=anthropic`

```shell
export ANTHROPIC_API_KEY="your_api_key_here"
```

You can also supply the API key via JVM system property:

```shell
-Dautomobile.anthropic.api.key=your_api_key_here
```

Optional proxy endpoint (all providers):

```shell
-Dautomobile.ai.proxy.endpoint=https://your-proxy.example.com
```

On CI you should provide these as environment-injected secrets with masking to protect your credentials.
