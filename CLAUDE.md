# AutoMobile

Node TypeScript MCP server providing Android Debug Bridge (ADB) capabilities through MCP tool calls for device automation.

## Build & Validate

```bash
npm run build    # Compile TypeScript
npm run lint     # Lint with auto-fix (run before manual fixes)
npm run test     # Run all tests
npm run test -- --grep "test name"  # Run specific tests
```

## Key Rules

- Never write JavaScript - TypeScript only
- After implementation changes, run relevant validation commands
- Write terminal output to `scratch/` directory when not visible
- See `docs/ai/validation.md` for full validation guide

## Project Structure

- `src/` - MCP server source code
- `docs/` - Documentation (features, installation, MCP server details)
- `android/` - Android-specific components and playground app

## MCP Server

The server exposes device automation via tool calls:
- **observe** - Capture screen state and view hierarchy
- **tapOn/swipe/scroll** - UI interactions
- **launchApp/terminateApp/installApp** - App management
- **inputText/clearText/pressButton** - Input methods
- **listDevices/startDevice/killDevice** - Device management
