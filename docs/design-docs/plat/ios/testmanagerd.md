# testmanagerd — Why XCUITest Is the Only Viable Path

<kbd>✅ Implemented</kbd>

> **Current state:** This document explains why `CtrlProxy iOS` uses XCUITest (the only sanctioned path to cross-process accessibility on iOS). The `simctl spawn` approach replacing `xcodebuild` is implemented. This is a reference/architecture doc, not a feature to implement. See the [Status Glossary](../../status-glossary.md) for chip definitions.

## What Is testmanagerd?

`testmanagerd` is a privileged system daemon that ships on every iOS device and simulator. It is responsible for:

- Coordinating test execution between Xcode and the device
- Brokering **cross-process accessibility access** on behalf of XCUITest
- Managing the `XCTRunnerDaemonSession` that connects the test runner to the target app

It is not a public framework — it is a private Apple daemon (`/System/Library/PrivateFrameworks/XCTAutomationSupport.framework`) that Xcode's toolchain communicates with over a private IPC transport called **DTXTransport / DTXConnection**, located under:

```
Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/Library/PrivateFrameworks/DTXConnectionServices.framework
```

## How XCUITest Uses testmanagerd

When a test calls `XCUIApplication.snapshot()` or `XCUIElement.tap()`, the call chain is:

```
XCUIApplication.snapshot()
  → XCTRunnerDaemonSession (in runner process)
    → testmanagerd (via DTXConnection / private IPC)
      → target app's accessibility tree
```

The key insight is that **testmanagerd holds the privileged entitlements** required to read another process's accessibility tree. Neither the test runner nor a third-party process can do this directly without going through testmanagerd.

## Why No Public Equivalent Exists

VoiceOver uses the same underlying mechanism (the `com.apple.accessibility.axserver` daemon family) with private entitlements that Apple does not expose to third parties. The entitlements required for cross-process accessibility (`com.apple.private.accessibility.inspection.allow`) are restricted to Apple-internal and testmanagerd-approved callers.

Attempts to replicate this without XCUITest face two hard blockers:

1. **Entitlement restriction**: The private entitlement is checked by the kernel — it cannot be spoofed by a user-space app.
2. **No public API**: `AXUIElement` (the public accessibility API on macOS) has no iOS equivalent that works cross-process without these entitlements.

## Why CtrlProxy iOS Uses This Path

CtrlProxy iOS is an XCUITest runner that starts a WebSocket server. By running as an XCUITest, it inherits the `XCTRunnerDaemonSession → testmanagerd` connection and can call `XCUIApplication.snapshot()` to read the full accessibility hierarchy of any foreground app.

This is the **only Apple-sanctioned path** to cross-process, privileged accessibility access on iOS.

## How simctl spawn Relates

When launching via `xcrun simctl spawn <udid> <runner-binary>`, the runner binary is the `CtrlProxy iOSUITests-Runner` executable embedded inside the `.app` bundle. When spawned:

1. The runner binary locates its embedded `.xctest` bundle (`CtrlProxy iOSUITests.xctest`) co-located inside `CtrlProxy iOSUITests-Runner.app/`.
2. It sets up the `XCTRunnerDaemonSession → testmanagerd` connection (the same as when launched via `xcodebuild test-without-building`).
3. The test's `waitForExpectations` keeps the process alive without burning CPU in a RunLoop spin loop.

The benefit over `xcodebuild test-without-building` is that `simctl spawn` skips the full xcodebuild test pipeline startup overhead (no `.xctestrun` file parsing, no build product re-verification, no `xcodebuild` process lifecycle). This makes service startup significantly faster for simulators.

**Physical devices** continue to use `xcodebuild test-without-building` because `simctl spawn` only works for simulators.

## Summary

| Question | Answer |
|---|---|
| Why XCUITest? | Only path to cross-process privileged accessibility access on iOS |
| Who provides that access? | `testmanagerd`, a privileged system daemon |
| How does the runner connect? | Via `XCTRunnerDaemonSession → testmanagerd → DTXConnection` |
| Why can't third parties replicate it? | Private entitlements + no public API |
| Why simctl spawn for simulators? | Skips xcodebuild overhead while preserving the testmanagerd connection |
