# Architecture

## MCP Server

The Model Context Protocol (MCP) server is the core component of AutoMobile, built with Node.js and TypeScript using the
MCP TypeScript SDK. It serves as both a server for AI agents to interact with Android devices and a command-line
interface for direct usage.

See [MCP features](mcp/features.md) for specific feature details.

## Clikt app

The Clikt application is a Kotlin-based command-line interface that facilitates test authoring and device interaction.
It leverages the Clikt library for creating intuitive command-line interfaces and serves as a bridge between the MCP
server's capabilities and native Android testing frameworks. This component enables developers to author tests in Kotlin
while benefiting from the comprehensive device automation capabilities provided by the broader AutoMobile ecosystem.

## Android JUnitRunner

The Android JUnitRunner is responsible for executing authored tests on Android devices and emulators. It extends the
standard Android testing framework to provide enhanced capabilities including intelligent test execution, detailed
reporting, and integration with the MCP server's device management features. The runner is designed to eventually
support agentic self-healing capabilities, allowing tests to automatically adapt and recover from common failure
scenarios by leveraging AI-driven analysis of test failures and UI changes.

## Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and user interface elements without
requiring device rooting or special permissions beyond accessibility service enablement. This service acts as a bridge
between the Android system's accessibility framework and AutoMobile's automation capabilities. When enabled, the
accessibility service continuously monitors UI changes and provides detailed information about view hierarchies. It
writes this file to disk on every update which AutoMobile can then query over adb. The service runs without additional
performance overhead.
