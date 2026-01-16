import Foundation
#if canImport(XCTest) && os(iOS)
import XCTest
#endif

/// Main XCTestService that coordinates WebSocket server, element locator, and gesture performer
/// Similar to Appium's WebDriverAgent but matching Android AccessibilityService protocol
public class XCTestService {

    public static let defaultPort: UInt16 = 8765

    private let server: WebSocketServer
    private let elementLocator: ElementLocator
    private let gesturePerformer: GesturePerformer
    private let commandHandler: CommandHandler

    #if canImport(XCTest) && os(iOS)
    private var application: XCUIApplication?
    #endif

    /// Creates the service with specified port
    public init(port: UInt16 = defaultPort) {
        self.elementLocator = ElementLocator()
        self.gesturePerformer = GesturePerformer(elementLocator: elementLocator)
        self.commandHandler = CommandHandler(
            elementLocator: elementLocator,
            gesturePerformer: gesturePerformer
        )
        self.server = WebSocketServer(port: port, commandHandler: commandHandler)
    }

    #if canImport(XCTest) && os(iOS)
    /// Default bundle ID to use when none is specified (iOS Settings app)
    public static let defaultBundleId = "com.apple.Preferences"

    /// Sets the application under test
    public func setApplication(_ app: XCUIApplication) {
        self.application = app
        elementLocator.setApplication(app)
        gesturePerformer.setApplication(app)
    }

    /// Launches the target application and starts the service
    public func start(bundleId: String? = nil) throws {
        // Launch or connect to target app
        // Use provided bundleId, or default to Settings app (avoids XCUIApplication() crash in SPM tests)
        let targetBundleId = bundleId ?? Self.defaultBundleId
        let app = XCUIApplication(bundleIdentifier: targetBundleId)
        app.launch()
        setApplication(app)
        print("[XCTestService] Launched app: \(targetBundleId)")

        // Start the server
        try server.start()

        print("[XCTestService] Service started")
        print("[XCTestService] WebSocket server listening on port \(Self.defaultPort)")
        print("[XCTestService] Endpoint: ws://localhost:\(Self.defaultPort)/ws")
        print("[XCTestService] Health check: http://localhost:\(Self.defaultPort)/health")
        print("[XCTestService] Ready to accept connections")
    }
    #else
    public func start(bundleId: String? = nil) throws {
        try server.start()
        print("[XCTestService] Service started (non-iOS mode - limited functionality)")
    }
    #endif

    /// Stops the service
    public func stop() {
        server.stop()
        print("[XCTestService] Service stopped")
    }

    /// Keeps the service running indefinitely
    public func runForever() {
        print("[XCTestService] Running forever (Ctrl+C to stop)")

        let runLoop = RunLoop.current
        while server.isRunning {
            runLoop.run(until: Date(timeIntervalSinceNow: 1.0))
        }
    }

    /// Runs the service for a specified duration
    public func run(for duration: TimeInterval) {
        print("[XCTestService] Running for \(duration) seconds")

        let endTime = Date(timeIntervalSinceNow: duration)
        let runLoop = RunLoop.current

        while server.isRunning && Date() < endTime {
            runLoop.run(until: Date(timeIntervalSinceNow: 1.0))
        }
    }
}

// MARK: - Convenience Extensions

extension XCTestService {

    /// Creates and starts a service with default configuration
    public static func startDefault() throws -> XCTestService {
        let service = XCTestService()
        try service.start()
        return service
    }

    /// Creates and starts a service for a specific app
    public static func start(bundleId: String, port: UInt16 = defaultPort) throws -> XCTestService {
        let service = XCTestService(port: port)
        try service.start(bundleId: bundleId)
        return service
    }
}
