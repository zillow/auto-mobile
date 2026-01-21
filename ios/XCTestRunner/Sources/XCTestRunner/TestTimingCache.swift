import Foundation

struct TestTimingStatusCounts: Codable {
    let passed: Int
    let failed: Int
    let skipped: Int

    init(passed: Int = 0, failed: Int = 0, skipped: Int = 0) {
        self.passed = passed
        self.failed = failed
        self.skipped = skipped
    }
}

struct TestTimingEntry: Codable {
    let testClass: String
    let testMethod: String
    let averageDurationMs: Int
    let sampleSize: Int
    let lastRun: String?
    let lastRunTimestampMs: Int?
    let successRate: Double?
    let failureRate: Double?
    let stdDevDurationMs: Int?
    let statusCounts: TestTimingStatusCounts?
}

struct TestTimingSummary: Codable {
    let testTimings: [TestTimingEntry]
    let generatedAt: String?
    let totalTests: Int
    let totalSamples: Int

    init(
        testTimings: [TestTimingEntry] = [],
        generatedAt: String? = nil,
        totalTests: Int = 0,
        totalSamples: Int = 0
    ) {
        self.testTimings = testTimings
        self.generatedAt = generatedAt
        self.totalTests = totalTests
        self.totalSamples = totalSamples
    }
}

struct TestTimingKey: Hashable {
    let testClass: String
    let testMethod: String
}

final class TestTimingCache {
    static let shared = TestTimingCache()

    private let jsonDecoder = JSONDecoder()
    private let loadLock = NSLock()
    private var loaded = false
    private var timingMap: [TestTimingKey: TestTimingEntry] = [:]
    private var summary: TestTimingSummary?

    private init() {}

    func prefetchIfEnabled() {
        guard isEnabled() else {
            return
        }

        if loaded {
            return
        }

        loadLock.lock()
        defer { loadLock.unlock() }

        if loaded {
            return
        }

        loadFromDaemon()
        loaded = true
    }

    func getTiming(testClass: String, testMethod: String) -> TestTimingEntry? {
        prefetchIfEnabled()
        return timingMap[TestTimingKey(testClass: testClass, testMethod: testMethod)]
    }

    func hasTimings() -> Bool {
        prefetchIfEnabled()
        return !timingMap.isEmpty
    }

    func getSummary() -> TestTimingSummary? {
        prefetchIfEnabled()
        return summary
    }

    func clear() {
        timingMap = [:]
        summary = nil
        loaded = false
    }

    private func isEnabled() -> Bool {
        if isCiMode() {
            return false
        }
        return config.boolValue(forKey: "automobile.junit.timing.enabled", defaultValue: true)
    }

    private func isCiMode() -> Bool {
        if config.boolValue(forKey: "automobile.ci.mode", defaultValue: false) {
            return true
        }
        guard let envValue = ProcessInfo.processInfo.environment["CI"] else {
            return false
        }
        return envValue.lowercased() == "true" || envValue == "1"
    }

    private func loadFromDaemon() {
        let uri = buildRequestUri()
        let timeoutSeconds = Double(resolveTimeoutMs()) / 1000.0
        do {
            let client = try AutoMobileTestTimingClient(environment: AutoMobileEnvironment())
            let payload = try client.readResource(uri: uri, timeout: timeoutSeconds)
            guard let data = payload.data(using: .utf8) else {
                return
            }
            if let jsonObject = try? JSONSerialization.jsonObject(with: data, options: []),
               let object = jsonObject as? [String: Any],
               let error = object["error"] as? String,
               !error.isEmpty
            {
                return
            }
            let parsed = try jsonDecoder.decode(TestTimingSummary.self, from: data)
            summary = parsed
            timingMap = Dictionary(
                uniqueKeysWithValues: parsed.testTimings.map {
                    (TestTimingKey(testClass: $0.testClass, testMethod: $0.testMethod), $0)
                }
            )
        } catch {}
    }

    private func buildRequestUri() -> String {
        var params: [String: String] = [:]
        params["lookbackDays"] = String(resolvePositiveIntProperty(
            "automobile.junit.timing.lookback.days",
            fallback: 90
        ))
        params["limit"] = String(resolvePositiveIntProperty("automobile.junit.timing.limit", fallback: 1000))
        params["minSamples"] = String(resolveMinSamples())
        params["devicePlatform"] = "ios"

        let sessionUuid = AutoMobileSession.currentSessionUuid()
        if !sessionUuid.isEmpty {
            params["sessionUuid"] = sessionUuid
        }

        if params.isEmpty {
            return "automobile:test-timings"
        }

        let query = params
            .map { key, value in
                "\(key)=\(encodeQueryParam(value))"
            }
            .joined(separator: "&")
        return "automobile:test-timings?\(query)"
    }

    private func resolveMinSamples() -> Int {
        let value = config.intValue(forKey: "automobile.junit.timing.min.samples", defaultValue: 1)
        return max(0, value)
    }

    private func resolvePositiveIntProperty(_ key: String, fallback: Int) -> Int {
        let value = config.intValue(forKey: key, defaultValue: fallback)
        return value > 0 ? value : fallback
    }

    private func resolveTimeoutMs() -> Int {
        let value = config.intValue(forKey: "automobile.junit.timing.fetch.timeout.ms", defaultValue: 5000)
        return value > 0 ? value : 5000
    }

    private func encodeQueryParam(_ value: String) -> String {
        return value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }

    private var config: TimingConfig {
        return TimingConfig()
    }
}

private struct TimingConfig {
    private let defaults = UserDefaults.standard
    private let environment = ProcessInfo.processInfo.environment

    func stringValue(forKey key: String) -> String? {
        if let value = defaults.object(forKey: key) {
            if let stringValue = value as? String {
                return stringValue
            }
            return String(describing: value)
        }
        return environment[key]
    }

    func intValue(forKey key: String, defaultValue: Int) -> Int {
        if let value = stringValue(forKey: key), let parsed = Int(value) {
            return parsed
        }
        return defaultValue
    }

    func boolValue(forKey key: String, defaultValue: Bool) -> Bool {
        guard let value = stringValue(forKey: key)?.lowercased() else {
            return defaultValue
        }
        if ["1", "true", "yes", "y"].contains(value) {
            return true
        }
        if ["0", "false", "no", "n"].contains(value) {
            return false
        }
        return defaultValue
    }
}

private final class AutoMobileTestTimingClient {
    private let mcpClient: AutoMobileMCPClient

    init(environment: AutoMobileEnvironment) throws {
        if let endpoint = environment.firstNonEmpty([
            "AUTOMOBILE_MCP_URL",
            "AUTOMOBILE_MCP_HTTP_URL",
            "MCP_ENDPOINT",
        ]) {
            let normalizedEndpoint = AutoMobileTestTimingClient.normalizeEndpoint(endpoint)
            guard let endpointURL = URL(string: normalizedEndpoint) else {
                throw MCPClientError.invalidEndpoint(normalizedEndpoint)
            }
            mcpClient = try StreamableHTTPMCPClient(endpoint: endpointURL)
        } else {
            let socketPath = environment.firstNonEmpty([
                "AUTOMOBILE_DAEMON_SOCKET_PATH",
                "AUTO_MOBILE_DAEMON_SOCKET_PATH",
            ]) ?? AutoMobileDaemonSocket.defaultPath
            mcpClient = AutoMobileDaemonClient(socketPath: socketPath)
        }
    }

    func readResource(uri: String, timeout: TimeInterval) throws -> String {
        let response = try mcpClient.readResource(uri: uri, timeout: timeout)
        return response.text
    }

    private static func normalizeEndpoint(_ endpoint: String) -> String {
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
