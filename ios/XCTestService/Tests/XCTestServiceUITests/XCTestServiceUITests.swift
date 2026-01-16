import XCTest
@testable import XCTestService

/// XCUITest runner that starts the XCTestService WebSocket server
/// Similar to Appium's WebDriverAgent, but matching Android AccessibilityService protocol
///
/// Usage:
/// 1. Build and run this test target on a device/simulator
/// 2. The test will start the WebSocket server on port 8765
/// 3. Connect your automation client to ws://localhost:8765/ws
/// 4. Send commands matching Android AccessibilityService protocol
///
/// Environment Variables:
/// - XCTESTSERVICE_PORT: Server port (default: 8765)
/// - XCTESTSERVICE_BUNDLE_ID: Target app bundle ID (optional)
/// - XCTESTSERVICE_TIMEOUT: How long to keep server running in seconds (default: forever)
///
final class XCTestServiceUITests: XCTestCase {

    private var service: XCTestService?

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    override func tearDownWithError() throws {
        service?.stop()
    }

    /// Main test that starts the WebSocket server
    /// This test runs indefinitely (or until timeout) to keep the server alive
    func testRunService() throws {
        // Get configuration from environment
        let port = getPort()
        let bundleId = getBundleId()
        let timeout = getTimeout()

        print("========================================")
        print("  XCTestService")
        print("========================================")
        print("Port: \(port)")
        print("Bundle ID: \(bundleId ?? "default")")
        print("Timeout: \(timeout == nil ? "forever" : "\(timeout!)s")")
        print("========================================")
        print("")
        print("WebSocket: ws://localhost:\(port)/ws")
        print("Health:    http://localhost:\(port)/health")
        print("")
        print("Protocol: Android AccessibilityService compatible")
        print("========================================")

        // Create and start service
        service = XCTestService(port: port)

        if let bundleId = bundleId {
            try service?.start(bundleId: bundleId)
        } else {
            try service?.start()
        }

        // Run the service
        if let timeout = timeout {
            service?.run(for: timeout)
        } else {
            service?.runForever()
        }
    }

    /// Test that just verifies the service can start
    func testServiceStarts() throws {
        let service = XCTestService(port: 8766)
        try service.start()

        // Give it a moment
        Thread.sleep(forTimeInterval: 1.0)

        XCTAssertTrue(true, "Service started successfully")

        service.stop()
    }

    /// Test that launches a specific app and starts the service
    func testLaunchAppAndRunService() throws {
        guard let bundleId = getBundleId() else {
            throw XCTSkip("XCTESTSERVICE_BUNDLE_ID environment variable not set")
        }

        service = XCTestService(port: getPort())
        try service?.start(bundleId: bundleId)

        // Run for specified timeout or 5 minutes by default
        let timeout = getTimeout() ?? 300
        service?.run(for: timeout)
    }

    // MARK: - Configuration Helpers

    private func getPort() -> UInt16 {
        if let portString = ProcessInfo.processInfo.environment["XCTESTSERVICE_PORT"],
           let port = UInt16(portString) {
            return port
        }
        return XCTestService.defaultPort
    }

    private func getBundleId() -> String? {
        return ProcessInfo.processInfo.environment["XCTESTSERVICE_BUNDLE_ID"]
    }

    private func getTimeout() -> TimeInterval? {
        if let timeoutString = ProcessInfo.processInfo.environment["XCTESTSERVICE_TIMEOUT"],
           let timeout = TimeInterval(timeoutString) {
            return timeout
        }
        return nil
    }
}

// MARK: - Quick Start Tests

extension XCTestServiceUITests {

    /// Convenience test for quick verification (30 seconds)
    func testQuickStart() throws {
        let service = XCTestService()
        try service.start()

        // Run for 30 seconds as a quick test
        service.run(for: 30)

        service.stop()
    }
}
