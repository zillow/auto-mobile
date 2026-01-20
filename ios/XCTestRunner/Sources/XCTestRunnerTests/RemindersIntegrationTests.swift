import XCTest
@testable import XCTestRunner

class RemindersIntegrationBase: AutoMobileTestCase {
    override var planBundle: Bundle? {
        return Bundle.module
    }

    override func setUpAutoMobile() throws {
        PerfTimer.log("setUpAutoMobile START")

        let env = AutoMobileEnvironment()
        if let explicit = env.boolValue(["AUTOMOBILE_INTEGRATION_TESTS"]) {
            PerfTimer.log("AUTOMOBILE_INTEGRATION_TESTS explicit value: \(explicit)")
            if !explicit {
                throw XCTSkip("Integration tests disabled via AUTOMOBILE_INTEGRATION_TESTS=0")
            }
        } else {
            let hasSimulator = PerfTimer.measure("SimulatorDetection.hasAvailableSimulator") {
                SimulatorDetection.hasAvailableSimulator()
            }
            PerfTimer.log("hasAvailableSimulator: \(hasSimulator)")
            guard hasSimulator else {
                throw XCTSkip("No simulator available. Set AUTOMOBILE_INTEGRATION_TESTS=1 to force run.")
            }
        }

        let daemonRunning = PerfTimer.measure("DaemonManager.ensureDaemonRunning") {
            DaemonManager.ensureDaemonRunning()
        }
        guard daemonRunning else {
            throw XCTSkip("Failed to start AutoMobile daemon. Ensure bun is installed and repo is accessible.")
        }

        let refreshResult = PerfTimer.measure("DaemonManager.refreshDevicePool") {
            DaemonManager.refreshDevicePool()
        }
        PerfTimer.log("refreshDevicePool result: success=\(refreshResult.success), availableDevices=\(refreshResult.availableDevices)")
        guard refreshResult.success && refreshResult.availableDevices > 0 else {
            throw XCTSkip("No devices available in pool after refresh. Boot a simulator first.")
        }

        PerfTimer.log("setUpAutoMobile END")
    }
}

final class RemindersLaunchPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "launch-reminders-app.yaml"
    }

    func testLaunchRemindersPlan() throws {
        PerfTimer.log("testLaunchRemindersPlan START - planPath: \(planPath)")
        let result = try executePlan()
        PerfTimer.log("testLaunchRemindersPlan END - result: \(result)")
    }
}

final class RemindersAddPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "add-reminder.yaml"
    }

    func testAddReminderPlan() throws {
        PerfTimer.log("testAddReminderPlan START - planPath: \(planPath)")
        let result = try executePlan()
        PerfTimer.log("testAddReminderPlan END - result: \(result)")
    }
}
