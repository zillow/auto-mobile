import Foundation
import Darwin
import XCTest

public enum AutoMobileTestCaseError: Error, CustomStringConvertible {
    case missingPlanPath
    case invalidEndpoint(String)
    case executorUnavailable

    public var description: String {
        switch self {
        case .missingPlanPath:
            return "Missing AutoMobile test plan path."
        case let .invalidEndpoint(endpoint):
            return "Invalid MCP endpoint: \(endpoint)"
        case .executorUnavailable:
            return "AutoMobile plan executor is unavailable."
        }
    }
}

/// Base XCTestCase for executing AutoMobile YAML automation plans via MCP.
open class AutoMobileTestCase: XCTestCase {
    override open class var defaultTestSuite: XCTestSuite {
        if self == AutoMobileTestCase.self {
            return XCTestSuite(name: "AutoMobileTestCase")
        }
        _ = AutoMobileTestObserver.registerIfNeeded()

        let baseSuite = super.defaultTestSuite
        let tests = baseSuite.tests
        let orderingSelection = resolveTimingOrderingSelection()
        let timingAvailable = TestTimingCache.shared.hasTimings()
        logTimingOrdering(selection: orderingSelection, timingAvailable: timingAvailable)

        let timingOrderingActive = orderingSelection.resolved != .none && timingAvailable
        if timingOrderingActive {
            let orderedTests = orderTestsByTiming(tests, strategy: orderingSelection.resolved)
            baseSuite.setValue(orderedTests, forKey: "tests")
        }
        return baseSuite
    }
    open var planPath: String {
        if let value = environment.firstNonEmpty(["AUTOMOBILE_TEST_PLAN", "PLAN_PATH"]) {
            return value
        }
        return ""
    }

    open var mcpEndpoint: String {
        return environment.firstNonEmpty([
            "AUTOMOBILE_MCP_URL",
            "AUTOMOBILE_MCP_HTTP_URL",
            "MCP_ENDPOINT"
        ]) ?? "http://localhost:9000/auto-mobile/streamable"
    }

    open var daemonSocketPath: String {
        return environment.firstNonEmpty([
            "AUTOMOBILE_DAEMON_SOCKET_PATH",
            "AUTO_MOBILE_DAEMON_SOCKET_PATH"
        ]) ?? AutoMobileDaemonSocket.defaultPath
    }

    open var retryCount: Int {
        return environment.intValue(["AUTOMOBILE_TEST_RETRY_COUNT", "RETRY_COUNT"]) ?? 0
    }

    open var timeoutSeconds: TimeInterval {
        return environment.doubleValue(["AUTOMOBILE_TEST_TIMEOUT_SECONDS", "TEST_TIMEOUT"]) ?? 300
    }

    open var retryDelaySeconds: TimeInterval {
        return environment.doubleValue(["AUTOMOBILE_TEST_RETRY_DELAY_SECONDS"]) ?? 1
    }

    open var startStep: Int {
        return 0
    }

    open var planParameters: [String: String] {
        return [:]
    }

    open var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
        return nil
    }

    open var planBundle: Bundle? {
        return Bundle(for: type(of: self))
    }

    open func setUpAutoMobile() throws {}
    open func tearDownAutoMobile() throws {}

    private var executor: AutoMobilePlanExecutor?
    private let environment = AutoMobileEnvironment()

    override open func setUpWithError() throws {
        try super.setUpWithError()
        try setUpAutoMobile()
        let config = try makeConfiguration()
        executor = AutoMobilePlanExecutor(configuration: config)
    }

    override open func tearDownWithError() throws {
        try tearDownAutoMobile()
        executor = nil
        try super.tearDownWithError()
    }

    public func executePlan() throws -> AutoMobilePlanExecutor.ExecutePlanResult {
        guard let executor = executor else {
            throw AutoMobileTestCaseError.executorUnavailable
        }
        let metadata = buildTestMetadata()
        return try executor.execute(testMetadata: metadata)
    }

    private func makeConfiguration() throws -> AutoMobilePlanExecutor.Configuration {
        let planPath = planPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !planPath.isEmpty else {
            throw AutoMobileTestCaseError.missingPlanPath
        }

        let transport: AutoMobilePlanExecutor.Transport
        if let endpoint = environment.firstNonEmpty([
            "AUTOMOBILE_MCP_URL",
            "AUTOMOBILE_MCP_HTTP_URL",
            "MCP_ENDPOINT"
        ]) {
            let normalizedEndpoint = normalizeEndpoint(endpoint)
            guard let endpointURL = URL(string: normalizedEndpoint) else {
                throw AutoMobileTestCaseError.invalidEndpoint(normalizedEndpoint)
            }
            transport = .streamableHttp(url: endpointURL)
        } else {
            transport = .daemonUnixSocket(path: daemonSocketPath)
        }

        return AutoMobilePlanExecutor.Configuration(
            transport: transport,
            planPath: planPath,
            retryCount: retryCount,
            timeoutSeconds: timeoutSeconds,
            retryDelaySeconds: retryDelaySeconds,
            startStep: startStep,
            parameters: planParameters,
            cleanup: cleanupOptions,
            planBundle: planBundle
        )
    }

    private func buildTestMetadata() -> AutoMobilePlanExecutor.TestMetadata {
        let className = String(describing: type(of: self))
        let methodName = testMethodName()
        let appVersion = environment.firstNonEmpty([
            "AUTOMOBILE_APP_VERSION",
            "AUTO_MOBILE_APP_VERSION",
            "APP_VERSION"
        ])
        let gitCommit = environment.firstNonEmpty([
            "AUTOMOBILE_GIT_COMMIT",
            "AUTO_MOBILE_GIT_COMMIT",
            "GITHUB_SHA",
            "GIT_COMMIT",
            "CI_COMMIT_SHA"
        ])
        let isCi = environment.boolValue(["AUTOMOBILE_CI_MODE", "CI", "GITHUB_ACTIONS"])

        return AutoMobilePlanExecutor.TestMetadata(
            testClass: className,
            testMethod: methodName,
            appVersion: appVersion,
            gitCommit: gitCommit,
            isCi: isCi
        )
    }

    private func testMethodName() -> String {
        if let selector = invocation?.selector {
            return NSStringFromSelector(selector)
        }
        let fullName = name
        if let range = fullName.range(of: " ") {
            let suffix = fullName[range.upperBound...]
            return suffix.trimmingCharacters(in: CharacterSet(charactersIn: "]"))
        }
        return fullName
    }

    private func normalizeEndpoint(_ endpoint: String) -> String {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.contains("/auto-mobile/streamable") || trimmed.contains("/auto-mobile/sse") {
            return trimmed
        }
        if trimmed.hasSuffix("/auto-mobile") {
            return "\(trimmed)/streamable"
        }
        return "\(trimmed)/auto-mobile/streamable"
    }

    private enum TimingOrderingStrategy: String {
        case none
        case auto
        case durationAsc
        case durationDesc
    }

    private struct TimingOrderingSelection {
        let requested: TimingOrderingStrategy
        let resolved: TimingOrderingStrategy
    }

    private struct TimingCandidate {
        let test: XCTest
        let index: Int
        let durationMs: Int?
    }

    private class func resolveTimingOrderingSelection() -> TimingOrderingSelection {
        let rawValue = timingConfigValue("automobile.junit.timing.ordering")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "auto"
        let requested = parseTimingOrderingStrategy(rawValue)
        let parallelWorkers = resolveParallelWorkerCount()
        let resolved: TimingOrderingStrategy
        if requested == .auto {
            resolved = parallelWorkers > 1 ? .durationDesc : .durationAsc
        } else {
            resolved = requested
        }
        return TimingOrderingSelection(requested: requested, resolved: resolved)
    }

    private class func parseTimingOrderingStrategy(_ rawValue: String) -> TimingOrderingStrategy {
        switch rawValue {
        case "auto":
            return .auto
        case "duration-asc", "duration_asc", "shortest-first", "shortest_first", "shortest":
            return .durationAsc
        case "duration-desc", "duration_desc", "longest-first", "longest_first", "longest":
            return .durationDesc
        case "none", "off", "false", "disabled":
            return .none
        default:
            return .none
        }
    }

    private class func resolveParallelWorkerCount() -> Int {
        if let argumentValue = argumentValue(flag: "-parallel-testing-worker-count"),
           let workerCount = Int(argumentValue), workerCount > 0 {
            return workerCount
        }
        if let envValue = ProcessInfo.processInfo.environment["XCTEST_PARALLEL_THREAD_COUNT"],
           let workerCount = Int(envValue), workerCount > 0 {
            return workerCount
        }
        return 1
    }

    private class func argumentValue(flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }

    private class func logTimingOrdering(selection: TimingOrderingSelection, timingAvailable: Bool) {
        if selection.requested == .auto {
            print("AutoMobileTestCase: Timing ordering=auto (resolved=\(selection.resolved.rawValue)), timing data available=\(timingAvailable)")
        } else {
            print("AutoMobileTestCase: Timing ordering=\(selection.requested.rawValue), timing data available=\(timingAvailable)")
        }
    }

    private class func orderTestsByTiming(
        _ tests: [XCTest],
        strategy: TimingOrderingStrategy
    ) -> [XCTest] {
        if strategy == .none || tests.isEmpty {
            return tests
        }

        let candidates = tests.enumerated().map { index, test in
            guard let testCase = test as? XCTestCase,
                  let methodName = testMethodName(from: testCase) else {
                return TimingCandidate(test: test, index: index, durationMs: nil)
            }
            let className = String(describing: type(of: testCase))
            let durationMs = TestTimingCache.shared.getTiming(testClass: className, testMethod: methodName)?.averageDurationMs
            return TimingCandidate(test: test, index: index, durationMs: durationMs)
        }

        let withTiming = candidates.filter { $0.durationMs != nil }
        let withoutTiming = candidates.filter { $0.durationMs == nil }

        if withTiming.isEmpty {
            return tests
        }

        let sortedWithTiming: [TimingCandidate]
        switch strategy {
        case .durationDesc:
            sortedWithTiming = withTiming.sorted {
                if $0.durationMs == $1.durationMs {
                    return $0.index < $1.index
                }
                return ($0.durationMs ?? 0) > ($1.durationMs ?? 0)
            }
        case .durationAsc:
            sortedWithTiming = withTiming.sorted {
                if $0.durationMs == $1.durationMs {
                    return $0.index < $1.index
                }
                return ($0.durationMs ?? 0) < ($1.durationMs ?? 0)
            }
        case .auto, .none:
            sortedWithTiming = withTiming
        }

        let sortedWithoutTiming = withoutTiming.sorted { $0.index < $1.index }
        return sortedWithTiming.map { $0.test } + sortedWithoutTiming.map { $0.test }
    }

    private class func timingConfigValue(_ key: String) -> String? {
        if let value = UserDefaults.standard.object(forKey: key) {
            if let stringValue = value as? String {
                return stringValue
            }
            return String(describing: value)
        }
        return ProcessInfo.processInfo.environment[key]
    }

    private class func testMethodName(from testCase: XCTestCase) -> String? {
        let fullName = testCase.name
        if let range = fullName.range(of: " ") {
            let suffix = fullName[range.upperBound...]
            return suffix.trimmingCharacters(in: CharacterSet(charactersIn: "]"))
        }
        return fullName
    }
}
