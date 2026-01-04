# Features

#### MCP Server

AutoMobile's main usage is driven through its Model Context Protocol ([MCP](https://modelcontextprotocol.io/introduction))
server. It has [observation](mcp-server/observation.md) built into its [interaction loop](mcp-server/interaction-loop.md)
that is fast. This is supported with performant frame rate observation to determine UI idling. Together, that allows for
accurate and precise exploration that gets better as more capabilities and heuristics are added. Every widget and
interaction added to the [AutoMobile Playground app](https://github.com/kaeawc/auto-mobile/blob/main/android/playground/README.md)
is tested with AutoMobile in order to keep improving.

#### Source Mapping

We combine project path config with deep view hierarchy analysis to determine the code is being rendered. This opens a
lot of possibilities so we're looking for ways to improve indexing performance and accuracy.

#### Test Execution

The Android JUnitRunner is responsible for executing authored tests on Android devices and emulators. It extends the
standard Android testing framework to provide enhanced capabilities including intelligent test execution, detailed
reporting, and integration with the MCP server's device management features. The runner is designed to eventually
support agentic self-healing capabilities, allowing tests to automatically adapt and recover from common failure
scenarios by leveraging AI-driven analysis of test failures and UI changes.

#### Device Management

Multi-device support with emulator control and app lifecycle management. As long as you have available adb connections,
AutoMobile can automatically track which one its using for which execution plan or MCP session. It also means that CI
setup just requires an open adb connection and AutoMobile will do the rest.

#### Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and user interface elements without
requiring device rooting or special permissions beyond accessibility service enablement. This service acts as a bridge
between the Android system's accessibility framework and AutoMobile's automation capabilities. When enabled, the
accessibility service continuously monitors UI changes and provides detailed information about view hierarchies. It
writes this file to disk on every update which AutoMobile can then query over adb. The service runs without additional
performance overhead.

#### Batteries Included

AutoMobile comes with extensive functionality to [minimize and automate setup](batteries-included.md) of required
platform tools.

## Components 

#### MCP Server

The Model Context Protocol ([MCP](https://modelcontextprotocol.io/introduction)) server is the core component of AutoMobile, built with Node.js and TypeScript using the
MCP TypeScript SDK. It serves as both a server for AI agents to interact with Android devices and a command-line
interface for direct usage. You can read more about its setup and system design in our [MCP server docs](mcp-server/index.md)
