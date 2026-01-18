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
        return super.defaultTestSuite
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
}

private enum AutoMobileDaemonSocket {
    static var defaultPath: String {
        let uid = String(getuid())
        return "/tmp/auto-mobile-daemon-\(uid).sock"
    }
}

private struct AutoMobileEnvironment {
    private let values: [String: String]

    init(values: [String: String] = ProcessInfo.processInfo.environment) {
        self.values = values
    }

    func firstNonEmpty(_ keys: [String]) -> String? {
        for key in keys {
            if let value = values[key], !value.isEmpty {
                return value
            }
        }
        return nil
    }

    func intValue(_ keys: [String]) -> Int? {
        if let stringValue = firstNonEmpty(keys) {
            return Int(stringValue)
        }
        return nil
    }

    func doubleValue(_ keys: [String]) -> Double? {
        if let stringValue = firstNonEmpty(keys) {
            return Double(stringValue)
        }
        return nil
    }

    func boolValue(_ keys: [String]) -> Bool? {
        guard let value = firstNonEmpty(keys) else {
            return nil
        }
        return ["1", "true", "yes", "y"].contains(value.lowercased())
    }
}
