import XCTest
@testable import XCTestRunner

class RemindersIntegrationBase: AutoMobileTestCase {
    override func setUpAutoMobile() throws {
        let enabled = ProcessInfo.processInfo.environment["AUTOMOBILE_INTEGRATION_TESTS"]
        guard enabled == "1" else {
            throw XCTSkip("Set AUTOMOBILE_INTEGRATION_TESTS=1 to run MCP integration tests.")
        }
    }
}

final class RemindersLaunchPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "Plans/launch-reminders-app.yaml"
    }

    func testLaunchRemindersPlan() throws {
        _ = try executePlan()
    }
}

final class RemindersAddPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "Plans/add-reminder.yaml"
    }

    func testAddReminderPlan() throws {
        _ = try executePlan()
    }
}
