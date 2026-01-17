import XCTest
@testable import XCTestRunner

final class XCTestRunnerTests: XCTestCase {
    func testAutoMobileTestCaseConfiguration() {
        let config = AutoMobileTestCase.Configuration(
            mcpEndpoint: "http://localhost:3000",
            planPath: "test.yaml",
            retryCount: 2,
            timeout: 300
        )

        XCTAssertEqual(config.mcpEndpoint, "http://localhost:3000")
        XCTAssertEqual(config.planPath, "test.yaml")
        XCTAssertEqual(config.retryCount, 2)
        XCTAssertEqual(config.timeout, 300)
    }

    func testAutoMobilePlanExecutorInitialization() {
        let config = AutoMobileTestCase.Configuration(
            mcpEndpoint: "http://localhost:3000",
            planPath: "test.yaml"
        )

        let executor = AutoMobilePlanExecutor(configuration: config)
        XCTAssertNotNil(executor)
    }

    func testAutoMobileTestObserver() {
        let observer = AutoMobileTestObserver.register()
        XCTAssertNotNil(observer)
    }

    // Add more tests as implementation progresses
}
