import XCTest
@testable import AXeAutomation

final class AXeAutomationTests: XCTestCase {

    func testAXeClientInitialization() {
        let client = AXeClient(host: "localhost", port: 8080)
        XCTAssertNotNil(client)
    }

    func testWebSocketClientInitialization() {
        let client = WebSocketClient(host: "localhost", port: 8080)
        XCTAssertNotNil(client)
    }

    // Add more tests as implementation progresses
}
