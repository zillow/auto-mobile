import XCTest
@testable import AutoMobileCompanion

final class AutoMobileCompanionTests: XCTestCase {

    func testMCPConnectionManagerInitialization() {
        let manager = MCPConnectionManager.shared
        XCTAssertNotNil(manager)
    }

    // Add more tests as implementation progresses
}
