import XCTest
@testable import XCTestRunner

class RemindersIntegrationBase: AutoMobileTestCase {
    override var planBundle: Bundle? {
        return Bundle.module
    }

    override func setUpAutoMobile() throws {
        print("[RemindersIntegrationBase] setUpAutoMobile starting...")

        let env = AutoMobileEnvironment()
        if let explicit = env.boolValue(["AUTOMOBILE_INTEGRATION_TESTS"]) {
            print("[RemindersIntegrationBase] AUTOMOBILE_INTEGRATION_TESTS explicit value: \(explicit)")
            if !explicit {
                throw XCTSkip("Integration tests disabled via AUTOMOBILE_INTEGRATION_TESTS=0")
            }
        } else {
            print("[RemindersIntegrationBase] Checking for available simulator...")
            let hasSimulator = SimulatorDetection.hasAvailableSimulator()
            print("[RemindersIntegrationBase] hasAvailableSimulator: \(hasSimulator)")
            guard hasSimulator else {
                throw XCTSkip("No simulator available. Set AUTOMOBILE_INTEGRATION_TESTS=1 to force run.")
            }
        }

        print("[RemindersIntegrationBase] Ensuring daemon is running...")
        guard DaemonManager.ensureDaemonRunning() else {
            throw XCTSkip("Failed to start AutoMobile daemon. Ensure bun is installed and repo is accessible.")
        }
        print("[RemindersIntegrationBase] Daemon is running")

        print("[RemindersIntegrationBase] Refreshing device pool...")
        let refreshResult = DaemonManager.refreshDevicePool()
        print("[RemindersIntegrationBase] refreshDevicePool result: success=\(refreshResult.success), availableDevices=\(refreshResult.availableDevices)")
        guard refreshResult.success && refreshResult.availableDevices > 0 else {
            throw XCTSkip("No devices available in pool after refresh. Boot a simulator first.")
        }

        print("[RemindersIntegrationBase] setUpAutoMobile complete")
    }
}

final class RemindersLaunchPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "launch-reminders-app.yaml"
    }

    func testLaunchRemindersPlan() throws {
        print("[RemindersLaunchPlanTests] Starting testLaunchRemindersPlan with planPath: \(planPath)")
        let result = try executePlan()
        print("[RemindersLaunchPlanTests] executePlan completed with result: \(result)")
    }
}

final class RemindersAddPlanTests: RemindersIntegrationBase {
    override var planPath: String {
        return ProcessInfo.processInfo.environment["AUTOMOBILE_TEST_PLAN"]
            ?? ProcessInfo.processInfo.environment["PLAN_PATH"]
            ?? "add-reminder.yaml"
    }

    func testAddReminderPlan() throws {
        print("[RemindersAddPlanTests] Starting testAddReminderPlan with planPath: \(planPath)")
        let result = try executePlan()
        print("[RemindersAddPlanTests] executePlan completed with result: \(result)")
    }
}
