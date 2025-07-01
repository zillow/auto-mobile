# Core Features

## Device Interaction

### Screen Analysis

- **Observe**: Combines screen size detection, system overlay insets, view hierarchy extraction, and screenshot capture
- **Screenshot capture**: High-quality PNG screenshots of current device state
- **View hierarchy extraction**: Supports both XML (traditional Android) and Compose UI hierarchies

### Touch and Gesture Control

- **Tap at Coordinates**: Precise coordinate-based tapping using `adb sendevent`
- **Tap on Text**: Intelligent text-based tapping with fuzzy search and view hierarchy analysis
- **Swipe on Element**: Directional swiping within element bounds with configurable release timing
- **Long Press**: Extended touch gestures for context menus and advanced interactions
- **Pinch to Zoom**: Multi-finger gestures for zoom interactions

### List and Scrollable Content

- **Scroll List to Index**: Navigate to specific positions (0 for start, -1 for end)
- **Scroll List to Text**: Intelligent scrolling until target text becomes visible
- **Fling List**: High-velocity scrolling with configurable speed (slow, normal, fast)
- **Pull to Refresh**: Standard refresh gesture implementation

### App Management

- **List Apps**: Enumerate all installed applications
- **Launch App**: Start applications by package name
- **Terminate App**: Force-stop running applications
- **Clear App Data**: Reset application state and storage
- **Install App**: Deploy APK files to device

### Input Methods

- **Send Keys**: Keyboard input simulation with natural typing delays (1-5ms between keystrokes)
- **Press Button**: Hardware button simulation (home, back, menu, power, volume)

### Device Configuration

- **Change Orientation**: Toggle between portrait and landscape modes
- **Open URL**: Launch URLs in default browser

## Advanced Capabilities

### Dialog Management

- **Exit Dialog**: Intelligent dialog dismissal by detecting common exit patterns ('Close', 'X', 'Exit', 'Cancel', 'Not
  Now', 'Later')

### Event Monitoring

- **Background Event Stream**: Continuous `adb getevent` monitoring to track touch events and system state
- **Idle Detection**: 100ms idle waiting after interactions to ensure UI stability

### Multi-Device Support

- **Device Enumeration**: List all connected physical devices and emulators
- **Emulator Management**: Start, stop, and manage Android Virtual Devices (AVDs)
- **Active Device Selection**: Switch between multiple connected devices

## Technical Implementation

### Performance Optimizations

- **View Hierarchy Caching**: Intelligent caching system to avoid redundant UI analysis
- **Screenshot Optimization**: Efficient image capture and processing
- **Event Coordination**: Proper sequencing of commands with state verification

### Error Handling

- **Graceful Degradation**: Fallback mechanisms when certain features aren't available
- **Device State Validation**: Continuous monitoring of device connectivity and responsiveness
- **Retry Logic**: Automatic retry for transient failures

### Security Considerations

- **Non-Root Operation**: All functionality works without device root access

