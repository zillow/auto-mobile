# Overview

AutoMobile's Android stack spans the MCP server, daemon, IDE plugin, JUnitRunner, and device-side services.

## Test Execution

The Android JUnitRunner executes AutoMobile tests on devices and emulators. It extends the standard
Android testing framework with richer reporting and tighter MCP integration, with a long-term goal of
self-healing test flows.

## Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and UI elements without
rooting or special permissions beyond accessibility enablement. When enabled, it monitors UI changes,
stores the latest hierarchy in app-private storage, and streams updates over WebSocket.

## Batteries Included

AutoMobile includes tooling to minimize setup for required platform dependencies.
