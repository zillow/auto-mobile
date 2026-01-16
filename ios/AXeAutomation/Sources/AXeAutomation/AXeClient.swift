import Foundation
import ApplicationServices

/// Client for AXe (Accessibility Engine) touch injection and automation
public class AXeClient {

    public enum AXeError: Error {
        case elementNotFound
        case invalidBounds
        case injectionFailed
        case connectionFailed
    }

    private let wsClient: WebSocketClient

    /// Initializes the AXe client with WebSocket connection to iOS automation server
    public init(host: String = "localhost", port: Int = 8080) {
        self.wsClient = WebSocketClient(host: host, port: port)
    }

    /// Connects to the iOS automation server
    public func connect() async throws {
        try await wsClient.connect()
    }

    /// Disconnects from the iOS automation server
    public func disconnect() {
        wsClient.disconnect()
    }

    /// Taps on an element by its accessibility identifier
    public func tap(elementId: String) async throws {
        let element = try await wsClient.findElement(byId: elementId)
        guard let bounds = element["bounds"] as? [String: CGFloat],
              let x = bounds["x"],
              let y = bounds["y"],
              let width = bounds["width"],
              let height = bounds["height"] else {
            throw AXeError.invalidBounds
        }

        let centerX = x + (width / 2)
        let centerY = y + (height / 2)

        try injectTouch(at: CGPoint(x: centerX, y: centerY))
    }

    /// Taps at specific coordinates
    public func tap(at point: CGPoint) throws {
        try injectTouch(at: point)
    }

    /// Performs a swipe gesture
    public func swipe(from start: CGPoint, to end: CGPoint, duration: TimeInterval = 0.3) throws {
        let steps = 20
        let stepDuration = duration / Double(steps)
        let deltaX = (end.x - start.x) / CGFloat(steps)
        let deltaY = (end.y - start.y) / CGFloat(steps)

        for i in 0...steps {
            let x = start.x + (deltaX * CGFloat(i))
            let y = start.y + (deltaY * CGFloat(i))
            try injectTouch(at: CGPoint(x: x, y: y))

            Thread.sleep(forTimeInterval: stepDuration)
        }
    }

    /// Types text into the focused element
    public func typeText(_ text: String) throws {
        for char in text {
            try injectKeyPress(String(char))
        }
    }

    /// Presses a specific key
    public func pressKey(_ key: String) throws {
        try injectKeyPress(key)
    }

    // MARK: - Private Methods

    private func injectTouch(at point: CGPoint) throws {
        // This uses macOS accessibility APIs to inject touch events into iOS Simulator
        // The actual implementation would use CGEvent for simulator control

        guard let event = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseDown,
            mouseCursorPosition: point,
            mouseButton: .left
        ) else {
            throw AXeError.injectionFailed
        }

        event.post(tap: .cghidEventTap)

        guard let upEvent = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseUp,
            mouseCursorPosition: point,
            mouseButton: .left
        ) else {
            throw AXeError.injectionFailed
        }

        upEvent.post(tap: .cghidEventTap)
    }

    private func injectKeyPress(_ key: String) throws {
        // Key press injection for iOS simulator
        // Implementation would map key strings to virtual key codes

        guard let keyCode = mapKeyToCode(key) else {
            throw AXeError.injectionFailed
        }

        guard let downEvent = CGEvent(
            keyboardEventSource: nil,
            virtualKey: keyCode,
            keyDown: true
        ) else {
            throw AXeError.injectionFailed
        }

        downEvent.post(tap: .cghidEventTap)

        guard let upEvent = CGEvent(
            keyboardEventSource: nil,
            virtualKey: keyCode,
            keyDown: false
        ) else {
            throw AXeError.injectionFailed
        }

        upEvent.post(tap: .cghidEventTap)
    }

    private func mapKeyToCode(_ key: String) -> CGKeyCode? {
        // Map key strings to CGKeyCode
        // This is a simplified version - full implementation would have complete mapping
        let keyMap: [String: CGKeyCode] = [
            "a": 0x00,
            "s": 0x01,
            "d": 0x02,
            "return": 0x24,
            "delete": 0x33
        ]

        return keyMap[key.lowercased()]
    }
}
