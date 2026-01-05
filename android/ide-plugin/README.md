# AutoMobile IDE Plugin

IntelliJ/Android Studio plugin scaffold for AutoMobile.

## Goals
- Attach to a running AutoMobile MCP server (Unix socket first).
- Render and import/export navigation graphs.
- Toggle feature flags without restarting the MCP server.

## Local development
Use the Android Gradle wrapper from the repository root:

```bash
cd android
./gradlew -p ide-plugin build
./gradlew -p ide-plugin runIde
```

## UI stack
The tool window uses Compose with JetBrains Jewel for rendering.

## References
- Slack Foundry repository (Skate IntelliJ plugin) for Gradle/plugin best practices: https://github.com/slackhq/foundry
