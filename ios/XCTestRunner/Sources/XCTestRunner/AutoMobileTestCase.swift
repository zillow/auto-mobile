import Foundation
import XCTest

/// Base XCTestCase for executing AutoMobile YAML automation plans via MCP
open class AutoMobileTestCase: XCTestCase {
    /// Configuration for the test case
    public struct Configuration {
        public let mcpEndpoint: String
        public let planPath: String
        public let retryCount: Int
        public let timeout: TimeInterval

        public init(
            mcpEndpoint: String = "http://localhost:3000",
            planPath: String,
            retryCount: Int = 0,
            timeout: TimeInterval = 300
        ) {
            self.mcpEndpoint = mcpEndpoint
            self.planPath = planPath
            self.retryCount = retryCount
            self.timeout = timeout
        }
    }

    /// The configuration for this test case
    public var configuration: Configuration?

    /// The plan executor
    private var executor: AutoMobilePlanExecutor?

    /// Override this method to provide the configuration for your test
    open func testConfiguration() -> Configuration {
        fatalError("Subclasses must override testConfiguration()")
    }

    /// Sets up the test case
    override open func setUp() {
        super.setUp()
        configuration = testConfiguration()
        executor = AutoMobilePlanExecutor(configuration: configuration!)
    }

    /// Tears down the test case
    override open func tearDown() {
        executor = nil
        configuration = nil
        super.tearDown()
    }

    /// Executes the automation plan
    public func executePlan() throws {
        guard let executor = executor else {
            XCTFail("Executor not initialized")
            return
        }

        try executor.execute()
    }

    /// Convenience method for plan-based test execution
    public func testPlan() throws {
        try executePlan()
    }
}

/// Example test case implementation
open class ExamplePlanTest: AutoMobileTestCase {
    override open func testConfiguration() -> Configuration {
        return Configuration(
            mcpEndpoint: ProcessInfo.processInfo.environment["MCP_ENDPOINT"] ?? "http://localhost:3000",
            planPath: ProcessInfo.processInfo.environment["PLAN_PATH"] ?? "plans/example.yaml",
            retryCount: 2,
            timeout: 300
        )
    }

    func testExample() throws {
        try testPlan()
    }
}
