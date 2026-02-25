# AutoMobile

Node TypeScript MCP server providing Android Debug Bridge (ADB) capabilities through MCP tool calls for device automation.

## Key Rules
- TypeScript only (no JavaScript)
- After implementation changes, run relevant validation commands
- Write terminal output to `scratch/` when not visible
- Local validation scripts live under `scripts/` and should almost always be written in bash with shellcheck validation
- Always use interfaces & fakes & FakeTimer to decouple implementations and keep tests extremely fast and non-flaky
- Unit tests should pass in 100ms or less. Do not assume that a failing test can be allowed to fail.

# Project Structure

This document summarizes the AutoMobile repo layout and where to find key components.

## Core Code
- `src/` - MCP server source code (TypeScript)
- `test/` - MCP server test code (TypeScript)
- `schemas/` - Generated schemas and tool definitions
- `dist/` - Build output

## Mobile Platforms
- `android/` - Android Kotlin Gradle project (apps, libraries, IDE plugin)
- `ios/` - Swift packages and Xcode projects

## Tooling and Automation
- `scripts/` - Local validation and utility scripts
- `benchmark/` - Benchmarks and baselines
- `docs/` - User and developer documentation

# Build & Validate TypeScript

Bun is the primary task runner for TypeScript tooling. Turborepo provides task caching.

```bash
turbo run build        # Compile TypeScript (cached)
turbo run lint         # Lint with auto-fix (cached)
turbo run test         # Run all tests (cached)
turbo run lint build test  # Run all with caching + parallelism
bun test --bail        # Stop on first failure (no cache)
bun test <file>        # Run specific test file (no cache)
```

# MCP Tools Reference

This is a high-level summary of core MCP tools exposed by the server.

## Observation
- `observe` - Capture screen state and view hierarchy

## Interaction
- `tapOn`, `swipeOn`, `dragAndDrop`, `pinchOn`
- `inputText`, `clearText`, `pressButton`, `pressKey`

## App Management
- `launchApp`, `terminateApp`, `installApp`

## Device Management
- `listDevices`, `startDevice`, `killDevice`, `setActiveDevice`
