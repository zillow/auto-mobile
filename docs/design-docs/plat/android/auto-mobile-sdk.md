# AutoMobile SDK

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** `android/auto-mobile-sdk/` is a published Android library. Includes navigation tracking (Navigation3, Circuit adapters), crash/ANR/handled exception capture, Compose recomposition tracking, notification triggering, SQLite database inspection, and SharedPreferences inspection. Published to Maven Central. See the [Status Glossary](../../status-glossary.md) for chip definitions.

The AutoMobile SDK provides Android-specific components for integrating AutoMobile into your Android applications and test suites.

The SDK consists of:

- [JUnitRunner](junitrunner.md) - Test execution framework with AI self-healing capabilities
- [Accessibility Service](control-proxy.md) - Real-time view hierarchy access and UI monitoring
- **Gradle Integration** - Build configuration and dependency management

## Setup

- Follow [JUnitRunner](junitrunner.md) for dependency installation and runner configuration.
- Enable the [Accessibility Service](control-proxy.md) on test devices to access the view hierarchy.

## See Also

- [MCP Server](../../mcp/index.md) - MCP Server integration
