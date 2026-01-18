---
description: Diagnose and fix AutoMobile setup issues
allowed-tools: mcp__auto-mobile__doctor
---

Run the AutoMobile doctor to diagnose setup issues and get actionable recommendations.

## Workflow

1. **Run diagnostics** using the `doctor` MCP tool to check:
   - System requirements (OS, architecture, runtime)
   - Android setup (ANDROID_HOME, ADB, emulator, AVDs, connected devices)
   - iOS setup (Xcode, Command Line Tools, simulators, code signing)
   - AutoMobile status (version, daemon, accessibility service)

2. **Analyze results** and categorize issues by severity:
   - **Failures**: Critical issues that must be fixed
   - **Warnings**: Non-blocking issues that may cause problems
   - **Passed**: Components working correctly

3. **Present recommendations** for each failed or warning check:
   - Explain what the issue means
   - Provide the specific command or action to fix it
   - Offer to help execute the fix if possible

4. **Platform-specific guidance**:
   - For Android issues: Guide through SDK setup, emulator creation, ADB configuration
   - For iOS issues: Guide through Xcode installation, simulator setup, provisioning profiles

## Common Issues and Fixes

- **ANDROID_HOME not set**: Export the environment variable pointing to Android SDK
- **No AVDs found**: Create an emulator via Android Studio or `avdmanager`
- **No devices connected**: Connect via USB or start an emulator/simulator
- **Daemon not running**: Start with `npx -y @kaeawc/auto-mobile@latest --daemon start`
- **Accessibility service not enabled**: Guide user through device Settings > Accessibility
- **Xcode Command Line Tools missing**: Run `xcode-select --install`
- **No simulator runtimes**: Install in Xcode Settings > Platforms

Report a summary with pass/warn/fail counts and prioritized action items.
