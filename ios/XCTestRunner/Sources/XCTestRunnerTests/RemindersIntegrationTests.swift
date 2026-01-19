import XCTest
@testable import XCTestRunner

class RemindersIntegrationBase: AutoMobileTestCase {
    override func setUpAutoMobile() throws {
        let environment = ProcessInfo.processInfo.environment
        let simulatorDetected = environment["SIMULATOR_UDID"] != nil
            || environment["SIMULATOR_DEVICE_NAME"] != nil
        guard simulatorDetected else {
            throw XCTSkip("iOS Simulator not detected; skipping Reminders integration tests.")
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
