import Foundation

// MARK: - ElementLocator Protocol

/// Protocol for locating UI elements and building view hierarchies
public protocol ElementLocating {
    /// Get the full view hierarchy
    func getViewHierarchy() throws -> ViewHierarchy

    /// Find element by resource ID / accessibility identifier
    func findElement(byResourceId resourceId: String) -> Any?

    /// Find element by text content
    func findElement(byText text: String) -> Any?
}

// MARK: - GesturePerformer Protocol

/// Protocol for performing gestures and interactions
public protocol GesturePerforming {
    // MARK: - Tap Gestures

    /// Tap at coordinates with optional duration for long press
    func tap(x: Double, y: Double, duration: TimeInterval) throws

    /// Double tap at coordinates
    func doubleTap(x: Double, y: Double) throws

    /// Long press at coordinates
    func longPress(x: Double, y: Double, duration: TimeInterval) throws

    // MARK: - Swipe Gestures

    /// Swipe from start to end coordinates
    func swipe(startX: Double, startY: Double, endX: Double, endY: Double, duration: TimeInterval) throws

    // MARK: - Drag Gestures

    /// Drag with press, drag, and hold durations
    func drag(
        startX: Double, startY: Double,
        endX: Double, endY: Double,
        pressDuration: TimeInterval,
        dragDuration: TimeInterval,
        holdDuration: TimeInterval
    ) throws

    // MARK: - Pinch Gestures

    /// Pinch at center with scale
    func pinch(centerX: Double, centerY: Double, scale: Double, duration: TimeInterval) throws

    // MARK: - Text Input

    /// Type text using keyboard
    func typeText(text: String) throws

    /// Set text on a specific element
    func setText(resourceId: String, text: String) throws

    /// Clear text from element or focused field
    func clearText(resourceId: String?) throws

    /// Select all text
    func selectAll() throws

    /// Perform IME action (done, next, search, etc.)
    func performImeAction(_ action: String) throws

    // MARK: - Actions

    /// Perform action on element
    func performAction(_ action: String, resourceId: String?) throws

    // MARK: - Screenshots

    /// Capture screenshot
    func getScreenshot() throws -> Data

    // MARK: - Device Control

    /// Set device orientation
    func setOrientation(_ orientation: String) throws

    /// Get current orientation
    func getOrientation() -> String

    /// Press home button
    func pressHome() throws

    // MARK: - App Control

    /// Launch app by bundle ID
    func launchApp(bundleId: String) throws

    /// Terminate app by bundle ID
    func terminateApp(bundleId: String) throws

    /// Activate app by bundle ID
    func activateApp(bundleId: String) throws
}

// MARK: - WebSocket Server Protocol

/// Protocol for WebSocket server operations
public protocol WebSocketServing {
    /// Whether the server is running
    var isRunning: Bool { get }

    /// Start the server
    func start() throws

    /// Stop the server
    func stop()

    /// Broadcast data to all connected clients
    func broadcast(_ data: Data)
}

// MARK: - Command Handler Protocol

/// Protocol for handling WebSocket commands
public protocol CommandHandling {
    /// Handle a request and return response
    func handle(_ request: WebSocketRequest) -> Any
}
