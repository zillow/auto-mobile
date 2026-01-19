import XCTest
@testable import XCTestRunner

class RemindersIntegrationBase: AutoMobileTestCase {
    override var planBundle: Bundle? {
        return Bundle.module
    }

    override func setUpAutoMobile() throws {
        let environment = ProcessInfo.processInfo.environment
        let simulatorDetected = environment["SIMULATOR_UDID"] != nil
            || environment["SIMULATOR_DEVICE_NAME"] != nil
            || hasBootedSimulator()
        guard simulatorDetected else {
            throw XCTSkip("iOS Simulator not detected; skipping Reminders integration tests.")
        }
    }

    private func hasBootedSimulator() -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
        process.arguments = ["simctl", "list", "devices", "--json"]

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        do {
            try process.run()
        } catch {
            return false
        }

        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            return false
        }

        let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        guard let json = try? JSONSerialization.jsonObject(with: data, options: []),
              let payload = json as? [String: Any],
              let devices = payload["devices"] as? [String: Any] else {
            return false
        }

        for (_, value) in devices {
            guard let deviceList = value as? [[String: Any]] else {
                continue
            }
            for device in deviceList {
                let state = device["state"] as? String
                let isAvailable = device["isAvailable"] as? Bool ?? true
                if state == "Booted", isAvailable {
                    return true
                }
            }
        }

        return false
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
