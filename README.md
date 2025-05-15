# MCP ADB Firebender

A Model Context Protocol (MCP) server that interfaces with ADB (Android Debug Bridge) for conducting automated user
interface interactions on Android devices.

## Features

- **Device Information**: Get screen size, resolution, and system insets
- **View Hierarchy**: Collect the view hierarchy of what is displayed on screen (XML or Compose)
- **Screenshots**: Take screenshots of the device display
- **Touch Events**: Monitor and simulate touch events (taps, swipes, gestures, pinch-to-zoom)
- **Device Control**: Change orientation, press hardware buttons
- **App Management**: List, launch, terminate, clear data, and install apps
- **Input Simulation**: Send text and key events to the device

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-adb-firebender.git
cd mcp-adb-firebender

# Install dependencies
npm install
```

## Prerequisites

- Node.js (v14 or higher)
- Android Debug Bridge (ADB) installed and available in your PATH
- An Android device or emulator connected via USB or network

## Usage

### Start the Server

```bash
npm start
```

The MCP server will start listening on port 3000 by default.

### API Endpoints

#### Device Management

- `GET /devices` - List all connected devices
- `POST /device/:deviceId` - Set the active device

#### Observation

- `POST /observe` - Get screen details, view hierarchy, and screenshot

#### Touch Interaction

- `POST /tap` - Tap at specific coordinates
- `POST /tapOnText` - Find and tap on text in the UI

#### App Management

- `GET /apps` - List installed apps
- `POST /app/:packageName/launch` - Launch an app
- `POST /app/:packageName/terminate` - Terminate an app
- `POST /app/:packageName/clear` - Clear app data

#### Input

- `POST /keys` - Send text input
- `POST /button/:button` - Press a hardware button (home, back, menu, power, etc.)

#### Device Control

- `POST /orientation/:orientation` - Change device orientation (portrait, landscape)
- `POST /url` - Open a URL in the default browser

## High-Level Commands

The server provides high-level commands that combine lower-level functionality:

- **Observe**: Combine screen size, insets, view hierarchy, and screenshot
- **Tap at Coordinates**: Tap and wait for idle state
- **Tap on Text**: Find text in the UI and tap on it
- **Scroll List**: Scroll to a specific index or text
- **Fling List**: Perform a fling gesture with specified speed
- **Swipe on Element**: Perform swipe gestures within an element's bounds
- **Pull to Refresh**: Perform a pull-to-refresh gesture
- **Exit Dialog**: Find and tap on dialog dismissal elements

## Running Tests

```bash
npm test
```

## License

ISC