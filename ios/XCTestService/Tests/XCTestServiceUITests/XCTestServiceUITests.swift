import XCTest

// Note: XCTestService sources are compiled directly into this target (not imported as framework)
// This gives XCTest access for XCUIApplication support

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

        print("========================================")
        print("  XCTestService")
        print("========================================")
        print("Port: \(port)")
        print("Bundle ID: \(bundleId ?? "default")")
        print("Timeout: \(getTimeout().map { "\($0)s" } ?? "forever")")
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

        // Keep the test alive using XCTWaiter instead of RunLoop spinning.
        // The expectation is intentionally never fulfilled; .timedOut is the
        // expected result for a normal timed shutdown. The process is killed
        // externally by the MCP stop() path before the timeout elapses.
        let keepAlive = expectation(description: "XCTestService keep-alive")
        let result = XCTWaiter().wait(for: [keepAlive], timeout: getTimeout() ?? 86400)
        XCTAssertEqual(result, .timedOut, "Expected service to run until timeout")
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

        let keepAlive = expectation(description: "XCTestService keep-alive")
        let result = XCTWaiter().wait(for: [keepAlive], timeout: getTimeout() ?? 300)
        XCTAssertEqual(result, .timedOut, "Expected service to run until timeout")
    }

    // MARK: - Configuration Helpers

    private func getPort() -> UInt16 {
        if let portString = ProcessInfo.processInfo.environment["XCTESTSERVICE_PORT"],
           let port = UInt16(portString)
        {
            return port
        }
        return XCTestService.defaultPort
    }

    private func getBundleId() -> String? {
        return ProcessInfo.processInfo.environment["XCTESTSERVICE_BUNDLE_ID"]
    }

    private func getTimeout() -> TimeInterval? {
        if let timeoutString = ProcessInfo.processInfo.environment["XCTESTSERVICE_TIMEOUT"],
           let timeout = TimeInterval(timeoutString)
        {
            return timeout
        }
        return nil
    }
}

