# AutoMobile SDK

The AutoMobile SDK provides Android-specific components for integrating AutoMobile into your Android applications and test suites.

## Overview

The SDK consists of:
- **JUnitRunner** - Test execution framework with AI self-healing capabilities
- **Accessibility Service** - Real-time view hierarchy access and UI monitoring
- **Gradle Integration** - Build configuration and dependency management

## Installation

### Gradle Dependency

Add the AutoMobile JUnitRunner to your app or library module:

```gradle
testImplementation("dev.jasonpearson.automobile.junitrunner:x.y.z")
```

**Note**: This artifact is not yet published to Maven Central. For now, publish to mavenLocal:

```bash
./gradlew publishToMavenLocal
```

Then use the version from `android/junit-runner/build.gradle.kts`.

### Accessibility Service

The AutoMobile Accessibility Service is included in the SDK and provides:
- Real-time view hierarchy access
- UI change monitoring
- WebSocket streaming to MCP Server
- No root access required

Enable it on your test device:
1. Go to Settings > Accessibility
2. Find "AutoMobile Accessibility Service"
3. Enable the service

## Components

### JUnitRunner

The JUnitRunner extends Android's standard test framework with:

- **AI Self-Healing** - Automatic test recovery from common failures using AI analysis
- **Device Pool Management** - Multi-device support with automatic device selection
- **Historical Timing** - Fetch test duration history to optimize test ordering
- **Model Provider Integration** - Built-in support for OpenAI, Anthropic, Google, AWS Bedrock

#### Configuration

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
-Dautomobile.ai.proxy.endpoint=https://your-proxy.example.com
```

#### Historical Timing

Enable test ordering based on historical execution time:

```properties
automobile.junit.timing.ordering=duration-desc  # Longest tests first
automobile.junit.timing.ordering=duration-asc   # Shortest tests first
```

Timing fetch is automatically disabled in CI environments (`automobile.ci.mode=true` or `CI=true`).

### Accessibility Service

The Accessibility Service provides:
- **Real-time Hierarchy** - Continuous UI monitoring without polling
- **WebSocket Streaming** - Live updates to MCP Server
- **File-based Fallback** - Writes hierarchy to app-private storage
- **No Root Required** - Works with standard Android permissions

The service writes view hierarchy data that the MCP Server consumes for observation and interaction.

## Supported Model Providers

The JUnitRunner includes built-in agent support for:

| Provider | Configuration |
|----------|---------------|
| ✅ OpenAI | `automobile.ai.provider=openai` |
| ✅ Anthropic | `automobile.ai.provider=anthropic` |
| ✅ Google | `automobile.ai.provider=google` |
| ✅ AWS Bedrock | `automobile.ai.provider=bedrock` |

Each provider requires its respective API key via environment variable or system property.

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

## Best Practices

1. **Use mavenLocal for development** - Until published to Maven Central
2. **Enable Accessibility Service** - Required for real-time view hierarchy access
3. **Configure API keys securely** - Use environment variables in CI, avoid hardcoding
4. **Enable timing optimization** - Use historical timing data to order tests efficiently
5. **Monitor device pool** - Ensure enough devices are available for parallel execution

## See Also

- [JUnitRunner](junitrunner.md) - Detailed JUnitRunner documentation
- [Accessibility Service](accessibility-service.md) - Accessibility Service technical details
- [MCP Server](../../mcp/index.md) - MCP Server integration
