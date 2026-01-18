import Foundation
import XCTest

/// XCTestObservation integration for collecting timing data and test results
public class AutoMobileTestObserver: NSObject, XCTestObservation {
    private static let registrationLock = NSLock()
    private static var sharedObserver: AutoMobileTestObserver?

    /// Timing data for test cases
    public struct TimingData {
        public let testName: String
        public let duration: TimeInterval
        public let startTime: Date
        public let endTime: Date
        public let passed: Bool
    }

    /// Collected timing data
    private var timingData: [TimingData] = []

    /// Current test start times keyed by test instance
    private var testStartTimes: [ObjectIdentifier: Date] = [:]

    private let timingLock = NSLock()

    /// Register this observer with the test observation center
    public static func register() -> AutoMobileTestObserver {
        return registerIfNeeded()
    }

    public static func registerIfNeeded() -> AutoMobileTestObserver {
        registrationLock.lock()
        defer { registrationLock.unlock() }

        if let existing = sharedObserver {
            return existing
        }

        let observer = AutoMobileTestObserver()
        XCTestObservationCenter.shared.addTestObserver(observer)
        sharedObserver = observer
        return observer
    }

    /// Called when a test case starts
    public func testCaseWillStart(_ testCase: XCTestCase) {
        timingLock.lock()
        testStartTimes[ObjectIdentifier(testCase)] = Date()
        timingLock.unlock()
        print("Test case starting: \(testCase.name)")
    }

    /// Called when a test case finishes
    public func testCaseDidFinish(_ testCase: XCTestCase) {
        timingLock.lock()
        let key = ObjectIdentifier(testCase)
        guard let startTime = testStartTimes.removeValue(forKey: key) else {
            timingLock.unlock()
            return
        }
        timingLock.unlock()

        let endTime = Date()
        let duration = endTime.timeIntervalSince(startTime)

        let timing = TimingData(
            testName: testCase.name,
            duration: duration,
            startTime: startTime,
            endTime: endTime,
            passed: testCase.testRun?.totalFailureCount == 0
        )

        timingLock.lock()
        timingData.append(timing)
        timingLock.unlock()

        print("Test case finished: \(testCase.name) - Duration: \(duration)s - Passed: \(timing.passed)")
    }

    /// Called when a test suite starts
    public func testSuiteWillStart(_ testSuite: XCTestSuite) {
        print("Test suite starting: \(testSuite.name)")
    }

    /// Called when a test suite finishes
    public func testSuiteDidFinish(_ testSuite: XCTestSuite) {
        print("Test suite finished: \(testSuite.name)")
        printSummary()
    }

    /// Gets all collected timing data
    public func getTimingData() -> [TimingData] {
        timingLock.lock()
        let data = timingData
        timingLock.unlock()
        return data
    }

    /// Exports timing data to JSON
    public func exportTimingData(to path: String) throws {
        let jsonData = try JSONEncoder().encode(timingData)
        try jsonData.write(to: URL(fileURLWithPath: path))
    }

    /// Prints a summary of timing data
    private func printSummary() {
        guard !timingData.isEmpty else {
            return
        }

        print("\n=== Test Timing Summary ===")
        print("Total tests: \(timingData.count)")
        print("Passed: \(timingData.filter { $0.passed }.count)")
        print("Failed: \(timingData.filter { !$0.passed }.count)")

        let totalDuration = timingData.reduce(0) { $0 + $1.duration }
        print("Total duration: \(String(format: "%.2f", totalDuration))s")

        if let slowest = timingData.max(by: { $0.duration < $1.duration }) {
            print("Slowest test: \(slowest.testName) (\(String(format: "%.2f", slowest.duration))s)")
        }

        if let fastest = timingData.min(by: { $0.duration < $1.duration }) {
            print("Fastest test: \(fastest.testName) (\(String(format: "%.2f", fastest.duration))s)")
        }

        print("===========================\n")
    }
}

// Make TimingData Encodable for JSON export
extension AutoMobileTestObserver.TimingData: Encodable {
    enum CodingKeys: String, CodingKey {
        case testName, duration, startTime, endTime, passed
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(testName, forKey: .testName)
        try container.encode(duration, forKey: .duration)
        try container.encode(ISO8601DateFormatter().string(from: startTime), forKey: .startTime)
        try container.encode(ISO8601DateFormatter().string(from: endTime), forKey: .endTime)
        try container.encode(passed, forKey: .passed)
    }
}
