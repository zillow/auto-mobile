import XCTest
@testable import AccessibilityService

final class AccessibilityServiceTests: XCTestCase {

    func testAccessibilityTreeProviderInitialization() {
        let provider = AccessibilityTreeProvider()
        XCTAssertNotNil(provider)
    }

    func testWebSocketServerInitialization() {
        let server = WebSocketServer(port: 8081)
        XCTAssertNotNil(server)
    }

    // Add more tests as implementation progresses
}
