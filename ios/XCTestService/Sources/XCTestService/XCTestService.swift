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
    private let hierarchyDebouncer: HierarchyDebouncer
    private let fpsMonitor: DisplayLinkFPSMonitor

    #if canImport(XCTest) && os(iOS)
        private var application: XCUIApplication?
    #endif

    /// Creates the service with specified port
    public init(port: UInt16 = defaultPort, timer: Timer = SystemTimer()) {
        elementLocator = ElementLocator()
        gesturePerformer = GesturePerformer(elementLocator: elementLocator)
        commandHandler = CommandHandler(
            elementLocator: elementLocator,
            gesturePerformer: gesturePerformer
        )
        server = WebSocketServer(port: port, commandHandler: commandHandler)
        hierarchyDebouncer = HierarchyDebouncer(elementLocator: elementLocator, timer: timer)
        fpsMonitor = DisplayLinkFPSMonitor()
    }

    #if canImport(XCTest) && os(iOS)
        /// Default bundle ID to use when none is specified (iOS Springboard/home screen)
        public static let defaultBundleId = "com.apple.springboard"

        /// Sets the application under test with its bundle ID
        public func setApplication(_ app: XCUIApplication, bundleId: String? = nil) {
            application = app
            if let bundleId = bundleId {
                elementLocator.setApplication(app, bundleId: bundleId)
            } else {
                elementLocator.setApplication(app)
            }
            gesturePerformer.setApplication(app)
        }

        /// Activates the target application and starts the service
        public func start(bundleId: String? = nil) throws {
            // Activate or connect to target app
            // Use provided bundleId, or default to Springboard (home screen)
            let targetBundleId = bundleId ?? Self.defaultBundleId
            let app = XCUIApplication(bundleIdentifier: targetBundleId)
            app.activate()
            setApplication(app, bundleId: targetBundleId)
            print("[XCTestService] Activated app: \(targetBundleId)")

            // Start the server
            try server.start()

            // Wire up hierarchy debouncer to broadcast updates when content changes
            hierarchyDebouncer.setOnResult { [weak self] result in
                switch result {
                case let .changed(hierarchy, hash, extractionTimeMs):
                    print(
                        "[XCTestService] Hierarchy changed (hash=\(hash), extraction=\(extractionTimeMs)ms), broadcasting"
                    )
                    self?.server.broadcastHierarchyUpdate(hierarchy)
                case .unchanged:
                    // Don't broadcast unchanged results (animation mode)
                    break
                case let .error(message):
                    print("[XCTestService] Hierarchy extraction error: \(message)")
                }
            }
            hierarchyDebouncer.start()

            // Start FPS monitoring and broadcast updates to connected clients
            fpsMonitor.startMonitoring { [weak self] snapshot in
                self?.server.broadcastPerformanceUpdate(snapshot)
            }

            print("[XCTestService] Service started")
            print("[XCTestService] WebSocket server listening on port \(Self.defaultPort)")
            print("[XCTestService] Endpoint: ws://localhost:\(Self.defaultPort)/ws")
            print("[XCTestService] Health check: http://localhost:\(Self.defaultPort)/health")
            print(
                "[XCTestService] Hierarchy debouncer active (polling every \(HierarchyDebouncer.defaultPollIntervalMs)ms)"
            )
            print("[XCTestService] FPS monitor active (reporting every \(DisplayLinkFPSMonitor.defaultReportIntervalSeconds)s)")
            print("[XCTestService] Ready to accept connections")
        }
    #else
        public func start(bundleId _: String? = nil) throws {
            try server.start()
            print("[XCTestService] Service started (non-iOS mode - limited functionality)")
        }
    #endif

    /// Stops the service
    public func stop() {
        fpsMonitor.stopMonitoring()
        hierarchyDebouncer.stop()
        server.stop()
        print("[XCTestService] Service stopped")
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
