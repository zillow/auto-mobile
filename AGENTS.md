# AutoMobile

Bun TypeScript MCP server providing Android & iOS device automation capabilities through its tools and resources. Kotlin & Swift supporting libraries and apps in `android/` and `ios/` respectively.

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

Bun is the primary task runner for TypeScript tooling.

-
-```bash
-bun run build          # Compile TypeScript
-bun run lint           # Lint with auto-fix (run before manual fixes)
-bun test               # Run all tests
-bun test --bail        # Stop on first failure
-bun test <file>        # Run specific test file
-```

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

# Codex specific

- GitHub interactions use the GitHub CLI (`gh`).
- Create or edit PRs with `gh pr create`/`gh pr edit` using `--body-file` to preserve newlines.
- Android tasks run via the Gradle wrapper from `android/` (e.g., `(cd android && ./gradlew <task>)`).
- Local validations live under `scripts/` (prefer existing scripts over ad-hoc checks).
- Bun tasks are defined in `package.json` (run with `bun run <script>`).

## Skills
- github-cli: Use `gh` for PRs, issues, checks, and repo metadata. Path: `skills/github-cli/SKILL.md`.
- gh-pr-workflow: Create/update PRs without mangling newlines. Path: `skills/gh-pr-workflow/SKILL.md`.
- android-gradlew: Run Android tasks via `android/gradlew`. Path: `skills/android-gradlew/SKILL.md`.
- local-validation-scripts: Use `scripts/` for local validations. Path: `skills/local-validation-scripts/SKILL.md`.
- bun-tasks: Use `package.json` scripts with Bun. Path: `skills/bun-tasks/SKILL.md`.
