# AutoMobile

Node TypeScript MCP server providing Android Debug Bridge (ADB) capabilities through MCP tool calls for device automation.

## Build & Validate

```bash
bun run build          # Compile TypeScript
bun run lint           # Lint with auto-fix (run before manual fixes)
bun test               # Run all tests
bun test --bail        # Stop on first failure
bun test <file>        # Run specific test file
bun test --coverage    # Run tests with coverage
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

## Performance Learnings

- `launchApp` with no parameters should NOT default to terminating the app (coldBoot=false by default)
- `checkForeground` uses single dumpsys call (~24ms) instead of 3 sequential calls (~309ms) - 12.9x faster
- Always skip checkForeground after terminateApp since we already know app is not in foreground
- `am start` with intent used as primary launch (faster than monkey); monkey kept as fallback
- `terminateApp` with `skipObservation: true` is fast (~100-160ms vs ~1579ms with full observation)
- Window foreground check must use `mCurrentFocus` not `Window #` to avoid false positives from background windows
