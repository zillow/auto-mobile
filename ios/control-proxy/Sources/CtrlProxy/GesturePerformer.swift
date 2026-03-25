import Foundation
#if canImport(XCTest) && os(iOS)
    import XCTest
#endif

/// Performs gestures and interactions using XCUITest APIs
public class GesturePerformer: GesturePerforming {
    public enum GestureError: LocalizedError {
        case noApplication
        case elementNotFound(String)
        case gestureFailed(String)
        case notSupported(String)
        case missingParameter(String)
        case clipboardEmpty
        case unsupportedAction(String)

        public var errorDescription: String? {
            switch self {
            case .noApplication:
                return "No application available for gestures"
            case let .elementNotFound(id):
                return "Element not found: \(id)"
            case let .gestureFailed(reason):
                return "Gesture failed: \(reason)"
            case let .notSupported(feature):
                return "Feature not supported: \(feature)"
            case let .missingParameter(param):
                return "Missing parameter: \(param)"
            case .clipboardEmpty:
                return "Clipboard is empty"
            case let .unsupportedAction(action):
                return "Unsupported action: \(action)"
            }
        }
    }

    #if canImport(XCTest) && os(iOS)
        private weak var application: XCUIApplication?
        private let elementLocator: ElementLocating

        public init(application: XCUIApplication? = nil, elementLocator: ElementLocating) {
            self.application = application
            self.elementLocator = elementLocator
        }

        public func setApplication(_ app: XCUIApplication) {
            application = app
        }

        // MARK: - Main Thread Helper

        /// Executes a throwing closure on the main thread and returns the result.
        /// XCUITest APIs must be called on the main thread.
        private func runOnMainThread<T>(_ block: @escaping () throws -> T) throws -> T {
            if Thread.isMainThread {
                return try block()
            }

            var result: Result<T, Error>!
            DispatchQueue.main.sync {
                do {
                    result = try .success(block())
                } catch {
                    result = .failure(error)
                }
            }
            return try result.get()
        }

        /// Executes a non-throwing closure on the main thread and returns the result.
        private func runOnMainThread<T>(_ block: @escaping () -> T) -> T {
            if Thread.isMainThread {
                return block()
            }

            var result: T!
            DispatchQueue.main.sync {
                result = block()
            }
            return result
        }

        // MARK: - Tap Gestures

        public func tap(x: Double, y: Double, duration: TimeInterval = 0) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                let coordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: x, dy: y))

                if duration > 0 {
                    coordinate.press(forDuration: duration)
                } else {
                    coordinate.tap()
                }
            }
        }

        public func doubleTap(x: Double, y: Double) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                let coordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: x, dy: y))
                coordinate.doubleTap()
            }
        }

        public func longPress(x: Double, y: Double, duration: TimeInterval) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                let coordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: x, dy: y))
                coordinate.press(forDuration: duration)
            }
        }

        // MARK: - Swipe Gestures

        public func swipe(startX: Double, startY: Double, endX: Double, endY: Double, duration _: TimeInterval) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                let startCoordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: startX, dy: startY))
                let endCoordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: endX, dy: endY))

                startCoordinate.press(
                    forDuration: 0.05,
                    thenDragTo: endCoordinate,
                    withVelocity: .default,
                    thenHoldForDuration: 0
                )
            }
        }

        // MARK: - Drag Gestures

        public func drag(
            startX: Double, startY: Double,
            endX: Double, endY: Double,
            pressDuration: TimeInterval,
            dragDuration _: TimeInterval,
            holdDuration: TimeInterval
        )
            throws
        {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                let startCoordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: startX, dy: startY))
                let endCoordinate = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: endX, dy: endY))

                // Press, drag, and hold
                startCoordinate.press(
                    forDuration: pressDuration,
                    thenDragTo: endCoordinate,
                    withVelocity: .default,
                    thenHoldForDuration: holdDuration
                )
            }
        }

        // MARK: - Pinch Gestures

        public func pinch(centerX _: Double, centerY _: Double, scale _: Double, duration _: TimeInterval) throws {
            // Pinch gesture using XCUITest is limited
            // We can simulate by using the app's pinch method if an element is available
            throw GestureError.notSupported("Coordinate-based pinch not yet implemented")
        }

        // MARK: - Text Input

        public func typeText(text: String) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                app.typeText(text)
            }
        }

        public func setText(resourceId: String, text: String) throws {
            guard let element = elementLocator.findElement(byResourceId: resourceId) as? XCUIElement else {
                throw GestureError.elementNotFound(resourceId)
            }

            runOnMainThread {
                // Clear existing text and type new text
                element.tap()

                // Select all and delete
                if let existingText = element.value as? String, !existingText.isEmpty {
                    let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: existingText.count)
                    element.typeText(deleteString)
                }

                element.typeText(text)
            }
        }

        public func clearText(resourceId: String? = nil) throws {
            if let resourceId = resourceId {
                guard let element = elementLocator.findElement(byResourceId: resourceId) as? XCUIElement else {
                    throw GestureError.elementNotFound(resourceId)
                }

                runOnMainThread {
                    element.tap()

                    if let existingText = element.value as? String, !existingText.isEmpty {
                        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: existingText.count)
                        element.typeText(deleteString)
                    }
                }
            } else {
                guard let app = application else {
                    throw GestureError.noApplication
                }
                runOnMainThread {
                    // Clear focused element
                    app.typeText(XCUIKeyboardKey.delete.rawValue)
                }
            }
        }

        public func selectAll() throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            runOnMainThread {
                // Try Cmd+A (select all)
                app.typeText("a") // Note: This is simplified, real select all would need modifier keys
            }
        }

        public func performImeAction(_ action: String) throws {
            guard let app = application else {
                throw GestureError.noApplication
            }

            switch action.lowercased() {
            case "done", "go", "search", "send", "next":
                runOnMainThread {
                    app.typeText("\n")
                }
            default:
                throw GestureError.notSupported("IME action: \(action)")
            }
        }

        // MARK: - Actions

        public func performAction(_ action: String, resourceId: String? = nil, label: String? = nil) throws {
            var element: XCUIElement? = nil
            if let resourceId = resourceId {
                element = elementLocator.findElement(byResourceId: resourceId) as? XCUIElement
            }
            if element == nil, let label = label {
                element = elementLocator.findElement(byText: label) as? XCUIElement
            }
            guard let found = element else {
                throw GestureError.elementNotFound(resourceId ?? label ?? "unknown")
            }

            try runOnMainThread {
                switch action.lowercased() {
                case "click", "tap":
                    found.tap()
                case "long_click", "long_press":
                    found.press(forDuration: 1.0)
                case "double_tap", "double_click":
                    found.doubleTap()
                case "scroll_forward":
                    found.swipeUp()
                case "scroll_backward":
                    found.swipeDown()
                case "focus":
                    found.tap()
                default:
                    throw GestureError.notSupported("Action: \(action)")
                }
            }
        }

        // MARK: - Screenshots

        public func getScreenshot() throws -> Data {
            guard let app = application else {
                throw GestureError.noApplication
            }

            return runOnMainThread {
                let screenshot = app.screenshot()
                return screenshot.pngRepresentation
            }
        }

        // MARK: - Device Control

        public func setOrientation(_ orientation: String) throws {
            try runOnMainThread {
                let device = XCUIDevice.shared

                switch orientation.lowercased() {
                case "portrait":
                    device.orientation = .portrait
                case "portrait_upside_down", "portraitupsidedown":
                    device.orientation = .portraitUpsideDown
                case "landscape_left", "landscapeleft":
                    device.orientation = .landscapeLeft
                case "landscape_right", "landscaperight":
                    device.orientation = .landscapeRight
                default:
                    throw GestureError.gestureFailed("Unknown orientation: \(orientation)")
                }
            }
        }

        public func getOrientation() -> String {
            return runOnMainThread {
                let device = XCUIDevice.shared

                switch device.orientation {
                case .portrait: return "portrait"
                case .portraitUpsideDown: return "portrait_upside_down"
                case .landscapeLeft: return "landscape_left"
                case .landscapeRight: return "landscape_right"
                default: return "unknown"
                }
            }
        }

        // MARK: - Clipboard

        public func clipboard(action: String, text: String?) throws -> String? {
            switch action {
            case "get":
                return runOnMainThread {
                    UIPasteboard.general.string
                }

            case "copy":
                guard let text = text else {
                    throw GestureError.missingParameter("text required for copy")
                }
                runOnMainThread {
                    UIPasteboard.general.string = text
                }
                return nil

            case "clear":
                runOnMainThread {
                    UIPasteboard.general.items = []
                }
                return nil

            case "paste":
                let clipboardText: String? = runOnMainThread {
                    UIPasteboard.general.string
                }
                guard let pasteText = clipboardText, !pasteText.isEmpty else {
                    throw GestureError.clipboardEmpty
                }
                try typeText(text: pasteText)
                return nil

            default:
                throw GestureError.unsupportedAction(action)
            }
        }

        public func pressHome() throws {
            runOnMainThread {
                XCUIDevice.shared.press(.home)
            }
        }

        // MARK: - App Control

        public func launchApp(bundleId: String) throws {
            runOnMainThread {
                let app = XCUIApplication(bundleIdentifier: bundleId)
                app.launch()
            }
        }

        public func terminateApp(bundleId: String) throws {
            runOnMainThread {
                let app = XCUIApplication(bundleIdentifier: bundleId)
                app.terminate()
            }
        }

        public func activateApp(bundleId: String) throws {
            runOnMainThread {
                let app = XCUIApplication(bundleIdentifier: bundleId)
                app.activate()
            }
        }

    #else
        /// Non-iOS stub implementation
        private let elementLocator: ElementLocating

        public init(elementLocator: ElementLocating) {
            self.elementLocator = elementLocator
        }

        public func tap(x _: Double, y _: Double, duration _: TimeInterval = 0) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func doubleTap(x _: Double, y _: Double) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func longPress(x _: Double, y _: Double, duration _: TimeInterval) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func swipe(
            startX _: Double,
            startY _: Double,
            endX _: Double,
            endY _: Double,
            duration _: TimeInterval
        )
            throws
        {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func drag(
            startX _: Double,
            startY _: Double,
            endX _: Double,
            endY _: Double,
            pressDuration _: TimeInterval,
            dragDuration _: TimeInterval,
            holdDuration _: TimeInterval
        )
            throws
        {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func pinch(centerX _: Double, centerY _: Double, scale _: Double, duration _: TimeInterval) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func typeText(text _: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func setText(resourceId _: String, text _: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func clearText(resourceId _: String?) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func selectAll() throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func performImeAction(_: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func performAction(_: String, resourceId _: String?, label _: String?) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func getScreenshot() throws -> Data {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func setOrientation(_: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func getOrientation() -> String {
            return "unknown"
        }

        public func clipboard(action _: String, text _: String?) throws -> String? {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func pressHome() throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func launchApp(bundleId _: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func terminateApp(bundleId _: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }

        public func activateApp(bundleId _: String) throws {
            throw GestureError.notSupported("XCUITest only available on iOS")
        }
    #endif
}
