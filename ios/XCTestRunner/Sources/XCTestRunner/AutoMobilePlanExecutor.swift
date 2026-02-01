import Foundation
import Network

public protocol AutoMobileLogger {
    func info(_ message: String)
    func warn(_ message: String)
    func error(_ message: String)
}

public struct StdoutLogger: AutoMobileLogger {
    public init() {}

    public func info(_ message: String) {
        print("[AutoMobile][INFO] \(message)")
    }

    public func warn(_ message: String) {
        print("[AutoMobile][WARN] \(message)")
    }

    public func error(_ message: String) {
        print("[AutoMobile][ERROR] \(message)")
    }
}

public protocol AutoMobileTimer {
    func now() -> TimeInterval
    func sleep(seconds: TimeInterval)
}

public final class SystemTimer: AutoMobileTimer {
    public init() {}

    public func now() -> TimeInterval {
        return Date().timeIntervalSince1970
    }

    public func sleep(seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }
}

public final class FakeTimer: AutoMobileTimer {
    public private(set) var currentTime: TimeInterval
    public private(set) var sleeps: [TimeInterval] = []

    public init(initialTime: TimeInterval = 0) {
        currentTime = initialTime
    }

    public func now() -> TimeInterval {
        return currentTime
    }

    public func sleep(seconds: TimeInterval) {
        sleeps.append(seconds)
        currentTime += seconds
    }
}

public protocol AutoMobilePlanLoading {
    func loadPlan(at path: String, bundle: Bundle?) throws -> String
}

public enum PlanLoaderError: Error, CustomStringConvertible {
    case notFound(String)
    case unreadable(String)

    public var description: String {
        switch self {
        case let .notFound(path):
            return "Plan not found at path: \(path)"
        case let .unreadable(path):
            return "Plan found but could not be read: \(path)"
        }
    }
}

public struct DefaultPlanLoader: AutoMobilePlanLoading {
    public init() {}

    public func loadPlan(at path: String, bundle: Bundle?) throws -> String {
        if let direct = resolveDirectPath(path) {
            return try readFile(at: direct)
        }

        if let bundle = bundle {
            if let resourceURL = bundle.url(forResource: path, withExtension: nil) {
                return try readFile(at: resourceURL)
            }
            if let resourceURL = resolveBundleResource(path: path, bundle: bundle) {
                return try readFile(at: resourceURL)
            }
            if let fallbackURL = resolveBundleFallback(path: path, bundle: bundle) {
                return try readFile(at: fallbackURL)
            }
        }

        if let mainURL = Bundle.main.url(forResource: path, withExtension: nil) {
            return try readFile(at: mainURL)
        }

        let cwdURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let relativeURL = cwdURL.appendingPathComponent(path)
        if FileManager.default.fileExists(atPath: relativeURL.path) {
            return try readFile(at: relativeURL)
        }

        throw PlanLoaderError.notFound(path)
    }

    private func resolveDirectPath(_ path: String) -> URL? {
        let url = URL(fileURLWithPath: path)
        if url.path.hasPrefix("/"), FileManager.default.fileExists(atPath: url.path) {
            return url
        }
        if FileManager.default.fileExists(atPath: url.path) {
            return url
        }
        return nil
    }

    private func resolveBundleResource(path: String, bundle: Bundle) -> URL? {
        let parts = path.split(separator: ".")
        if parts.count >= 2 {
            let name = parts.dropLast().joined(separator: ".")
            let ext = String(parts.last ?? "")
            return bundle.url(forResource: name, withExtension: ext)
        }
        return nil
    }

    private func resolveBundleFallback(path: String, bundle: Bundle) -> URL? {
        guard path.contains("/") else {
            return nil
        }
        let filename = URL(fileURLWithPath: path).lastPathComponent
        if let resourceURL = bundle.url(forResource: filename, withExtension: nil) {
            return resourceURL
        }
        return resolveBundleResource(path: filename, bundle: bundle)
    }

    private func readFile(at url: URL) throws -> String {
        do {
            return try String(contentsOf: url, encoding: .utf8)
        } catch {
            throw PlanLoaderError.unreadable(url.path)
        }
    }
}

public struct MCPToolResponse {
    public let text: String
}

public struct MCPResourceResponse {
    public let text: String
}

public enum MCPClientError: Error, CustomStringConvertible, Equatable {
    case invalidEndpoint(String)
    case invalidResponse(String)
    case serverError(String)
    case requestFailed(String)
    case sessionExpired

    public var description: String {
        switch self {
        case let .invalidEndpoint(message):
            return "Invalid MCP endpoint: \(message)"
        case let .invalidResponse(message):
            return "Invalid MCP response: \(message)"
        case let .serverError(message):
            return "MCP server error: \(message)"
        case let .requestFailed(message):
            return "MCP request failed: \(message)"
        case .sessionExpired:
            return "MCP session expired"
        }
    }

    public var isRetryable: Bool {
        switch self {
        case .invalidEndpoint:
            return false
        case .invalidResponse:
            return false
        case .serverError:
            return true
        case .requestFailed:
            return true
        case .sessionExpired:
            return true
        }
    }
}

public protocol AutoMobileMCPClient {
    func initialize(timeout: TimeInterval) throws
    func callTool(name: String, arguments: [String: Any], timeout: TimeInterval) throws -> MCPToolResponse
    func readResource(uri: String, timeout: TimeInterval) throws -> MCPResourceResponse
    func resetSession()
}

public final class AutoMobileDaemonClient: AutoMobileMCPClient {
    private let socketPath: String
    private let logger: AutoMobileLogger
    private let queue = DispatchQueue(label: "AutoMobileDaemonClient")
    private var connection: NWConnection?
    private var buffer = Data()
    private var requestId: Int64 = 0

    public init(socketPath: String, logger: AutoMobileLogger = StdoutLogger()) {
        self.socketPath = socketPath
        self.logger = logger
    }

    public func initialize(timeout: TimeInterval) throws {
        PerfTimer.log("DaemonClient.initialize START")
        try ensureConnection(timeout: timeout)
        PerfTimer.log("DaemonClient.initialize END")
    }

    public func callTool(name: String, arguments: [String: Any], timeout: TimeInterval) throws -> MCPToolResponse {
        PerfTimer.log("DaemonClient.callTool START: name=\(name)")
        let params: [String: Any] = [
            "name": name,
            "arguments": arguments,
        ]
        let result = try sendRequest(method: "tools/call", params: params, timeout: timeout)
        let text = try extractTextContent(from: result)
        PerfTimer.log("DaemonClient.callTool END: name=\(name), responseLength=\(text.count)")
        return MCPToolResponse(text: text)
    }

    public func readResource(uri: String, timeout: TimeInterval) throws -> MCPResourceResponse {
        PerfTimer.log("DaemonClient.readResource START: uri=\(uri)")
        let params: [String: Any] = [
            "uri": uri,
        ]
        let result = try sendRequest(method: "resources/read", params: params, timeout: timeout)
        let text = try extractResourceTextContent(from: result)
        PerfTimer.log("DaemonClient.readResource END: uri=\(uri), responseLength=\(text.count)")
        return MCPResourceResponse(text: text)
    }

    public func resetSession() {
        connection?.cancel()
        connection = nil
        buffer = Data()
    }

    private func ensureConnection(timeout: TimeInterval) throws {
        if connection != nil {
            PerfTimer.log("ensureConnection: already connected")
            return
        }

        PerfTimer.log("ensureConnection: creating NWConnection to \(socketPath)")
        let connection = NWConnection(to: .unix(path: socketPath), using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var connectionError: Error?

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                PerfTimer.log("ensureConnection: NWConnection ready")
                semaphore.signal()
            case let .failed(error):
                PerfTimer.log("ensureConnection: NWConnection failed - \(error)")
                connectionError = error
                semaphore.signal()
            case .cancelled:
                PerfTimer.log("ensureConnection: NWConnection cancelled")
                connectionError = MCPClientError.requestFailed("Daemon connection cancelled")
                semaphore.signal()
            default:
                break
            }
        }

        PerfTimer.log("ensureConnection: starting connection")
        connection.start(queue: queue)
        let timeoutResult = semaphore.wait(timeout: .now() + timeout)
        if timeoutResult == .timedOut {
            PerfTimer.log("ensureConnection: TIMEOUT")
            connection.cancel()
            throw MCPClientError.requestFailed("Timed out connecting to daemon socket")
        }

        if let error = connectionError {
            connection.cancel()
            throw MCPClientError.requestFailed(error.localizedDescription)
        }

        PerfTimer.log("ensureConnection: connected successfully")
        self.connection = connection
    }

    private func sendRequest(method: String, params: [String: Any], timeout: TimeInterval) throws -> [String: Any] {
        PerfTimer.log("sendRequest START: method=\(method)")
        try ensureConnection(timeout: timeout)
        guard let connection = connection else {
            throw MCPClientError.requestFailed("Daemon connection unavailable")
        }

        requestId += 1
        let request: [String: Any] = [
            "id": "\(requestId)",
            "type": "mcp_request",
            "method": method,
            "params": params,
            "timeoutMs": Int(timeout * 1000),
        ]

        let data = try JSONSerialization.data(withJSONObject: request, options: [])
        var payload = data
        payload.append(0x0A)
        PerfTimer.log("sendRequest: sending \(payload.count) bytes")

        let sendSemaphore = DispatchSemaphore(value: 0)
        var sendError: Error?
        connection.send(content: payload, completion: .contentProcessed { error in
            sendError = error
            sendSemaphore.signal()
        })

        let sendTimeout = sendSemaphore.wait(timeout: .now() + timeout)
        if sendTimeout == .timedOut {
            PerfTimer.log("sendRequest: TIMEOUT sending")
            throw MCPClientError.requestFailed("Timed out sending daemon request")
        }
        if let error = sendError {
            throw MCPClientError.requestFailed(error.localizedDescription)
        }
        PerfTimer.log("sendRequest: sent successfully, waiting for response")

        let responseData = try receiveLine(timeout: timeout)
        PerfTimer.log("sendRequest: received \(responseData.count) bytes")

        let jsonObject = try JSONSerialization.jsonObject(with: responseData, options: [])
        guard let response = jsonObject as? [String: Any] else {
            throw MCPClientError.invalidResponse("Expected JSON object response from daemon")
        }

        let success = response["success"] as? Bool ?? false
        if !success {
            let message = response["error"] as? String ?? "Daemon returned error"
            PerfTimer.log("sendRequest ERROR: \(message)")
            throw MCPClientError.serverError(message)
        }
        guard let result = response["result"] as? [String: Any] else {
            throw MCPClientError.invalidResponse("Missing result in daemon response")
        }
        PerfTimer.log("sendRequest END: method=\(method)")
        return result
    }

    private func receiveLine(timeout: TimeInterval) throws -> Data {
        guard let connection = connection else {
            throw MCPClientError.requestFailed("Daemon connection unavailable")
        }

        let semaphore = DispatchSemaphore(value: 0)
        var output: Data?
        var receiveError: Error?

        func receiveChunk() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
                if let data = data {
                    self.buffer.append(data)
                    if let lineRange = self.buffer.firstRange(of: Data([0x0A])) {
                        let lineData = self.buffer.subdata(in: 0 ..< lineRange.lowerBound)
                        self.buffer.removeSubrange(0 ... lineRange.lowerBound)
                        output = lineData
                        semaphore.signal()
                        return
                    }
                }

                if let error = error {
                    receiveError = error
                    semaphore.signal()
                    return
                }

                if isComplete {
                    receiveError = MCPClientError.requestFailed("Daemon connection closed")
                    semaphore.signal()
                    return
                }

                receiveChunk()
            }
        }

        receiveChunk()

        let waitResult = semaphore.wait(timeout: .now() + timeout)
        if waitResult == .timedOut {
            throw MCPClientError.requestFailed("Timed out waiting for daemon response")
        }
        if let error = receiveError {
            throw MCPClientError.requestFailed(error.localizedDescription)
        }
        guard let output = output else {
            throw MCPClientError.invalidResponse("Daemon response missing data")
        }
        return output
    }

    private func extractTextContent(from result: [String: Any]) throws -> String {
        guard let content = result["content"] as? [[String: Any]] else {
            throw MCPClientError.invalidResponse("Missing content array")
        }
        for item in content {
            if let type = item["type"] as? String, type == "text",
               let text = item["text"] as? String
            {
                return text
            }
        }
        throw MCPClientError.invalidResponse("Missing text content")
    }

    private func extractResourceTextContent(from result: [String: Any]) throws -> String {
        guard let contents = result["contents"] as? [[String: Any]], let first = contents.first else {
            throw MCPClientError.invalidResponse("Missing resource contents")
        }
        if let text = first["text"] as? String {
            return text
        }
        throw MCPClientError.invalidResponse("Missing resource text content")
    }
}

public final class StreamableHTTPMCPClient: AutoMobileMCPClient {
    private let endpoint: URL
    private let logger: AutoMobileLogger
    private let session: URLSession
    private var sessionId: String?
    private var requestId: Int64 = 0

    public init(endpoint: URL, logger: AutoMobileLogger = StdoutLogger(), session: URLSession = .shared) throws {
        guard endpoint.scheme != nil else {
            throw MCPClientError.invalidEndpoint(endpoint.absoluteString)
        }
        self.endpoint = endpoint
        self.logger = logger
        self.session = session
    }

    public func initialize(timeout: TimeInterval) throws {
        let params: [String: Any] = [
            "protocolVersion": "2024-11-05",
            "capabilities": [:],
            "clientInfo": [
                "name": "auto-mobile-xctest-runner",
                "version": "0.1.0",
            ],
        ]
        _ = try sendRequest(method: "initialize", params: params, timeout: timeout)
    }

    public func callTool(name: String, arguments: [String: Any], timeout: TimeInterval) throws -> MCPToolResponse {
        if sessionId == nil {
            try initialize(timeout: timeout)
        }

        let params: [String: Any] = [
            "name": name,
            "arguments": arguments,
        ]

        do {
            let result = try sendRequest(method: "tools/call", params: params, timeout: timeout)
            let text = try extractTextContent(from: result)
            return MCPToolResponse(text: text)
        } catch let error as MCPClientError where error == .sessionExpired {
            resetSession()
            try initialize(timeout: timeout)
            let result = try sendRequest(method: "tools/call", params: params, timeout: timeout)
            let text = try extractTextContent(from: result)
            return MCPToolResponse(text: text)
        }
    }

    public func readResource(uri: String, timeout: TimeInterval) throws -> MCPResourceResponse {
        if sessionId == nil {
            try initialize(timeout: timeout)
        }

        let params: [String: Any] = [
            "uri": uri,
        ]

        do {
            let result = try sendRequest(method: "resources/read", params: params, timeout: timeout)
            let text = try extractResourceTextContent(from: result)
            return MCPResourceResponse(text: text)
        } catch let error as MCPClientError where error == .sessionExpired {
            resetSession()
            try initialize(timeout: timeout)
            let result = try sendRequest(method: "resources/read", params: params, timeout: timeout)
            let text = try extractResourceTextContent(from: result)
            return MCPResourceResponse(text: text)
        }
    }

    public func resetSession() {
        sessionId = nil
    }

    private func sendRequest(method: String, params: [String: Any], timeout: TimeInterval) throws -> [String: Any] {
        requestId += 1
        let payload: [String: Any] = [
            "jsonrpc": "2.0",
            "id": requestId,
            "method": method,
            "params": params,
        ]

        let data = try JSONSerialization.data(withJSONObject: payload, options: [])
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = data
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json, text/event-stream", forHTTPHeaderField: "Accept")
        if let sessionId = sessionId {
            request.setValue(sessionId, forHTTPHeaderField: "MCP-Session-Id")
        }

        let responseData = try performRequest(request: request, timeout: timeout)

        let jsonObject = try JSONSerialization.jsonObject(with: responseData, options: [])
        guard let response = jsonObject as? [String: Any] else {
            throw MCPClientError.invalidResponse("Expected JSON object response")
        }

        if let error = response["error"] as? [String: Any] {
            let message = error["message"] as? String ?? "Unknown MCP error"
            throw MCPClientError.serverError(message)
        }

        guard let result = response["result"] as? [String: Any] else {
            throw MCPClientError.invalidResponse("Missing result in MCP response")
        }
        return result
    }

    private func performRequest(request: URLRequest, timeout: TimeInterval) throws -> Data {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<Data, Error>?

        let task = session.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error = error {
                result = .failure(MCPClientError.requestFailed(error.localizedDescription))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                result = .failure(MCPClientError.invalidResponse("Missing HTTP response"))
                return
            }

            if httpResponse.statusCode == 404 {
                result = .failure(MCPClientError.sessionExpired)
                return
            }

            if let sessionHeader = self.extractSessionId(from: httpResponse) {
                self.sessionId = sessionHeader
            }

            guard let data = data else {
                result = .failure(MCPClientError.invalidResponse("Empty response body"))
                return
            }
            result = .success(data)
        }
        task.resume()

        let timeoutResult = semaphore.wait(timeout: .now() + timeout + 1)
        if timeoutResult == .timedOut {
            task.cancel()
            throw MCPClientError.requestFailed("Request timed out")
        }

        switch result {
        case let .success(data):
            return data
        case let .failure(error):
            throw error
        case .none:
            throw MCPClientError.requestFailed("Request failed without response")
        }
    }

    private func extractSessionId(from response: HTTPURLResponse) -> String? {
        for (key, value) in response.allHeaderFields {
            let keyString = String(describing: key).lowercased()
            guard keyString == "mcp-session-id" else {
                continue
            }
            if let valueString = value as? String {
                return valueString
            }
        }
        return nil
    }

    private func extractTextContent(from result: [String: Any]) throws -> String {
        guard let content = result["content"] as? [[String: Any]] else {
            throw MCPClientError.invalidResponse("Missing content array")
        }
        for item in content {
            if let type = item["type"] as? String, type == "text",
               let text = item["text"] as? String
            {
                return text
            }
        }
        throw MCPClientError.invalidResponse("Missing text content")
    }

    private func extractResourceTextContent(from result: [String: Any]) throws -> String {
        guard let contents = result["contents"] as? [[String: Any]], let first = contents.first else {
            throw MCPClientError.invalidResponse("Missing resource contents")
        }
        if let text = first["text"] as? String {
            return text
        }
        throw MCPClientError.invalidResponse("Missing resource text content")
    }
}

public final class AutoMobilePlanExecutor {
    public enum PlanPlatform: String {
        case ios
        case android
    }

    public enum Transport {
        case daemonUnixSocket(path: String)
        case streamableHttp(url: URL)
    }

    public struct CleanupOptions {
        public let appId: String
        public let clearAppData: Bool

        public init(appId: String, clearAppData: Bool = false) {
            self.appId = appId
            self.clearAppData = clearAppData
        }
    }

    public struct Configuration {
        public let transport: Transport
        public let planPath: String
        public let retryCount: Int
        public let timeoutSeconds: TimeInterval
        public let retryDelaySeconds: TimeInterval
        public let startStep: Int
        public let parameters: [String: String]
        public let cleanup: CleanupOptions?
        public let planBundle: Bundle?
        public let defaultPlatform: PlanPlatform

        public init(
            transport: Transport,
            planPath: String,
            retryCount: Int = 0,
            timeoutSeconds: TimeInterval = 300,
            retryDelaySeconds: TimeInterval = 1,
            startStep: Int = 0,
            parameters: [String: String] = [:],
            cleanup: CleanupOptions? = nil,
            planBundle: Bundle? = nil,
            defaultPlatform: PlanPlatform = .ios
        ) {
            self.transport = transport
            self.planPath = planPath
            self.retryCount = max(0, retryCount)
            self.timeoutSeconds = timeoutSeconds
            self.retryDelaySeconds = retryDelaySeconds
            self.startStep = startStep
            self.parameters = parameters
            self.cleanup = cleanup
            self.planBundle = planBundle
            self.defaultPlatform = defaultPlatform
        }
    }

    public struct TestMetadata {
        public let testClass: String
        public let testMethod: String
        public let appVersion: String?
        public let gitCommit: String?
        public let isCi: Bool?

        public init(
            testClass: String,
            testMethod: String,
            appVersion: String? = nil,
            gitCommit: String? = nil,
            isCi: Bool? = nil
        ) {
            self.testClass = testClass
            self.testMethod = testMethod
            self.appVersion = appVersion
            self.gitCommit = gitCommit
            self.isCi = isCi
        }
    }

    public struct FailedStep: Decodable {
        public let stepIndex: Int
        public let tool: String
        public let error: String
        public let device: String?
    }

    public struct ExecutePlanResult: Decodable {
        public let success: Bool
        public let executedSteps: Int
        public let totalSteps: Int
        public let failedStep: FailedStep?
        public let error: String?
        public let platform: String?
        public let deviceMapping: [String: String]?
    }

    public enum ExecutorError: Error, CustomStringConvertible {
        case planNotFound(String)
        case invalidPlan(String)
        case mcpFailure(String)
        case executionFailed(String)
        case invalidResponse(String)

        public var description: String {
            switch self {
            case let .planNotFound(path):
                return "Plan not found: \(path)"
            case let .invalidPlan(message):
                return "Invalid plan: \(message)"
            case let .mcpFailure(message):
                return "MCP failure: \(message)"
            case let .executionFailed(message):
                return "Plan execution failed: \(message)"
            case let .invalidResponse(message):
                return "Invalid response: \(message)"
            }
        }

        public var isRetryable: Bool {
            switch self {
            case .planNotFound, .invalidPlan:
                return false
            case .mcpFailure, .executionFailed, .invalidResponse:
                return true
            }
        }
    }

    private let configuration: Configuration
    private let planLoader: AutoMobilePlanLoading
    private let mcpClient: AutoMobileMCPClient
    private let timer: AutoMobileTimer
    private let logger: AutoMobileLogger
    private let sessionIdProvider: () -> String

    public init(
        configuration: Configuration,
        planLoader: AutoMobilePlanLoading = DefaultPlanLoader(),
        mcpClient: AutoMobileMCPClient? = nil,
        timer: AutoMobileTimer = SystemTimer(),
        logger: AutoMobileLogger = StdoutLogger(),
        sessionIdProvider: @escaping () -> String = { AutoMobileSession.currentSessionUuid() }
    ) {
        self.configuration = configuration
        self.planLoader = planLoader
        self.timer = timer
        self.logger = logger
        self.sessionIdProvider = sessionIdProvider

        if let mcpClient = mcpClient {
            self.mcpClient = mcpClient
        } else {
            switch configuration.transport {
            case let .daemonUnixSocket(path):
                self.mcpClient = AutoMobileDaemonClient(socketPath: path, logger: logger)
            case let .streamableHttp(url):
                do {
                    self.mcpClient = try StreamableHTTPMCPClient(endpoint: url, logger: logger)
                } catch {
                    self.mcpClient = FailingMCPClient(error: error)
                }
            }
        }
    }

    public func execute(testMetadata: TestMetadata? = nil) throws -> ExecutePlanResult {
        var lastError: Error?

        for attempt in 0 ... configuration.retryCount {
            do {
                if attempt > 0 {
                    logger.info("Retry attempt \(attempt + 1) of \(configuration.retryCount + 1)")
                }
                return try executeOnce(testMetadata: testMetadata)
            } catch {
                lastError = error
                let shouldRetry = shouldRetry(error: error, attempt: attempt)
                logger.warn("Plan execution attempt \(attempt + 1) failed: \(error)")
                if shouldRetry {
                    timer.sleep(seconds: configuration.retryDelaySeconds)
                } else {
                    break
                }
            }
        }

        if let error = lastError {
            throw error
        }
        throw ExecutorError.executionFailed("Unknown failure")
    }

    private func executeOnce(testMetadata: TestMetadata?) throws -> ExecutePlanResult {
        PerfTimer.log("executeOnce START")
        let planContent: String
        do {
            planContent = try PerfTimer.measure("loadPlan") {
                try planLoader.loadPlan(at: configuration.planPath, bundle: configuration.planBundle)
            }
        } catch let error as PlanLoaderError {
            throw ExecutorError.planNotFound(error.description)
        } catch {
            throw ExecutorError.planNotFound(error.localizedDescription)
        }
        PerfTimer.log("planContent loaded, length=\(planContent.count) chars")

        let substituted = PerfTimer.measure("substituteParameters") {
            substituteParameters(in: planContent, parameters: configuration.parameters)
        }
        let planMetadata = try PerfTimer.measure("parsePlanMetadata") {
            try PlanMetadataParser.parse(from: substituted)
        }
        PerfTimer
            .log(
                "planMetadata: platform=\(planMetadata.platform.map { String(describing: $0) } ?? "nil"), hasDevices=\(planMetadata.hasDevices), deviceLabels=\(planMetadata.deviceLabels)"
            )

        let platform = try resolvePlatform(from: planMetadata)
        PerfTimer.log("resolved platform=\(platform)")

        let sessionUuid = sessionIdProvider()
        PerfTimer.log("sessionUuid=\(sessionUuid)")

        let arguments = PerfTimer.measure("buildExecutePlanArguments") {
            buildExecutePlanArguments(
                planContent: substituted,
                sessionUuid: sessionUuid,
                platform: platform,
                deviceLabels: planMetadata.deviceLabels,
                testMetadata: testMetadata
            )
        }
        PerfTimer.log("arguments built, keys=\(arguments.keys.sorted())")

        do {
            try PerfTimer.measure("mcpClient.initialize") {
                try mcpClient.initialize(timeout: configuration.timeoutSeconds)
            }
            PerfTimer.log("calling executePlan tool with timeout=\(configuration.timeoutSeconds)s")
            let response = try PerfTimer.measure("mcpClient.callTool(executePlan)") {
                try mcpClient.callTool(
                    name: "executePlan",
                    arguments: arguments,
                    timeout: configuration.timeoutSeconds
                )
            }
            PerfTimer.log("executePlan response received, length=\(response.text.count) chars")
            let result = try PerfTimer.measure("decodeExecutePlanResult") {
                try decodeExecutePlanResult(from: response.text)
            }
            PerfTimer
                .log("executeOnce END - success=\(result.success), steps=\(result.executedSteps)/\(result.totalSteps)")
            if result.success {
                return result
            }
            throw ExecutorError.executionFailed(buildFailureMessage(from: result))
        } catch let error as MCPClientError {
            PerfTimer.log("executeOnce ERROR: MCPClientError - \(error.description)")
            throw ExecutorError.mcpFailure(error.description)
        } catch let error as ExecutorError {
            PerfTimer.log("executeOnce ERROR: ExecutorError - \(error)")
            throw error
        } catch {
            PerfTimer.log("executeOnce ERROR: \(error.localizedDescription)")
            throw ExecutorError.executionFailed(error.localizedDescription)
        }
    }

    private func buildExecutePlanArguments(
        planContent: String,
        sessionUuid: String,
        platform: PlanPlatform,
        deviceLabels: [String],
        testMetadata: TestMetadata?
    )
        -> [String: Any]
    {
        let base64Content = Data(planContent.utf8).base64EncodedString()
        var args: [String: Any] = [
            "planContent": "base64:\(base64Content)",
            "platform": platform.rawValue,
            "startStep": configuration.startStep,
            "sessionUuid": sessionUuid,
        ]

        if let cleanup = configuration.cleanup {
            args["cleanupAppId"] = cleanup.appId
            args["cleanupClearAppData"] = cleanup.clearAppData
        }

        if !deviceLabels.isEmpty {
            args["devices"] = deviceLabels
        }

        if let metadata = testMetadata {
            var metadataArgs: [String: Any] = [
                "testClass": metadata.testClass,
                "testMethod": metadata.testMethod,
            ]
            if let appVersion = metadata.appVersion {
                metadataArgs["appVersion"] = appVersion
            }
            if let gitCommit = metadata.gitCommit {
                metadataArgs["gitCommit"] = gitCommit
            }
            if let isCi = metadata.isCi {
                metadataArgs["isCi"] = isCi
            }
            args["testMetadata"] = metadataArgs
        }

        return args
    }

    private func substituteParameters(in content: String, parameters: [String: String]) -> String {
        guard !parameters.isEmpty else {
            return content
        }
        var substituted = content
        for (key, value) in parameters {
            substituted = substituted.replacingOccurrences(of: "${\(key)}", with: value)
        }
        return substituted
    }

    private func decodeExecutePlanResult(from text: String) throws -> ExecutePlanResult {
        guard let data = text.data(using: .utf8) else {
            throw ExecutorError.invalidResponse("Response text is not valid UTF-8")
        }
        do {
            return try JSONDecoder().decode(ExecutePlanResult.self, from: data)
        } catch {
            throw ExecutorError.invalidResponse("Failed to decode executePlan response: \(error)")
        }
    }

    private func shouldRetry(error: Error, attempt: Int) -> Bool {
        if attempt >= configuration.retryCount {
            return false
        }
        if let executorError = error as? ExecutorError {
            return executorError.isRetryable
        }
        if let mcpError = error as? MCPClientError {
            return mcpError.isRetryable
        }
        return true
    }

    private func buildFailureMessage(from result: ExecutePlanResult) -> String {
        var message = ""
        if let failedStep = result.failedStep {
            message += "Test plan execution failed at step \(failedStep.stepIndex + 1) (\(failedStep.tool)):"
            message += "\n  Error: \(failedStep.error)"
            message += "\n  Executed: \(result.executedSteps)/\(result.totalSteps) steps"
            if let device = failedStep.device {
                message += "\n  Device: \(device)"
            }
        } else {
            message = result.error ?? "AutoMobile plan failed"
        }
        return message
    }
}

private final class FailingMCPClient: AutoMobileMCPClient {
    private let error: Error

    init(error: Error) {
        self.error = error
    }

    func initialize(timeout _: TimeInterval) throws {
        throw error
    }

    func callTool(name _: String, arguments _: [String: Any], timeout _: TimeInterval) throws -> MCPToolResponse {
        throw error
    }

    func readResource(uri _: String, timeout _: TimeInterval) throws -> MCPResourceResponse {
        throw error
    }

    func resetSession() {}
}

private struct PlanMetadata {
    let platform: AutoMobilePlanExecutor.PlanPlatform?
    let devicePlatforms: [String: AutoMobilePlanExecutor.PlanPlatform]
    let deviceLabels: [String]
    let hasDevices: Bool
}

private enum PlanMetadataParser {
    static func parse(from yamlContent: String) throws -> PlanMetadata {
        let lines = yamlContent.split(whereSeparator: \.isNewline).map { String($0) }
        var platform: AutoMobilePlanExecutor.PlanPlatform?
        var devicePlatforms: [String: AutoMobilePlanExecutor.PlanPlatform] = [:]
        var deviceLabels: [String] = []
        var hasDevices = false

        var index = 0
        while index < lines.count {
            let line = stripComments(from: lines[index])
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                index += 1
                continue
            }

            let indent = indentationLevel(line)
            if indent == 0 && trimmed.hasPrefix("platform:") {
                let value = trimmed.dropFirst("platform:".count).trimmingCharacters(in: .whitespaces)
                let normalized = unquote(value)
                if let parsed = AutoMobilePlanExecutor.PlanPlatform(rawValue: normalized) {
                    platform = parsed
                } else if !normalized.isEmpty {
                    throw AutoMobilePlanExecutor.ExecutorError.invalidPlan("Unknown platform value: \(normalized)")
                }
                index += 1
                continue
            }

            if indent == 0 && trimmed.hasPrefix("devices:") {
                hasDevices = true
                let listIndent = indentOfNextListItem(startingAt: index + 1, lines: lines) ?? (indent + 2)
                index += 1
                var currentLabel: String?
                var currentPlatform: AutoMobilePlanExecutor.PlanPlatform?

                while index < lines.count {
                    let rawLine = stripComments(from: lines[index])
                    if rawLine.trimmingCharacters(in: .whitespaces).isEmpty {
                        index += 1
                        continue
                    }

                    let currentIndent = indentationLevel(rawLine)
                    if currentIndent < listIndent {
                        break
                    }

                    let trimmedLine = rawLine.trimmingCharacters(in: .whitespaces)
                    if currentIndent == listIndent && trimmedLine.hasPrefix("-") {
                        if let label = currentLabel {
                            deviceLabels.append(label)
                        }
                        if let label = currentLabel, let platformValue = currentPlatform {
                            devicePlatforms[label] = platformValue
                        } else if currentLabel != nil || currentPlatform != nil {
                            throw AutoMobilePlanExecutor.ExecutorError.invalidPlan(
                                "Each device entry must include label and platform."
                            )
                        }
                        currentLabel = nil
                        currentPlatform = nil

                        let remainder = trimmedLine.dropFirst().trimmingCharacters(in: .whitespaces)
                        if remainder.isEmpty {
                            index += 1
                            continue
                        }
                        if remainder.contains(":") {
                            let (key, value) = splitKeyValue(remainder)
                            if key == "label" {
                                currentLabel = value
                            } else if key == "platform" {
                                currentPlatform = try parsePlatform(value)
                            } else if key == "name" {
                                currentLabel = value
                            }
                        } else {
                            currentLabel = remainder
                        }
                        index += 1
                        continue
                    }

                    if currentIndent > listIndent {
                        let (key, value) = splitKeyValue(trimmedLine)
                        if key == "label" || key == "name" {
                            currentLabel = value
                        } else if key == "platform" {
                            currentPlatform = try parsePlatform(value)
                        }
                        index += 1
                        continue
                    }

                    index += 1
                }

                if let label = currentLabel {
                    deviceLabels.append(label)
                }
                if let label = currentLabel, let platformValue = currentPlatform {
                    devicePlatforms[label] = platformValue
                } else if currentLabel != nil || currentPlatform != nil {
                    throw AutoMobilePlanExecutor.ExecutorError.invalidPlan(
                        "Each device entry must include label and platform."
                    )
                }
                continue
            }

            index += 1
        }

        if hasDevices && deviceLabels.isEmpty {
            throw AutoMobilePlanExecutor.ExecutorError.invalidPlan(
                "Multi-device plans must declare at least one device."
            )
        }

        if hasDevices && devicePlatforms.count != deviceLabels.count {
            throw AutoMobilePlanExecutor.ExecutorError.invalidPlan(
                "Multi-device plans must declare platform for each device."
            )
        }

        return PlanMetadata(
            platform: platform,
            devicePlatforms: devicePlatforms,
            deviceLabels: deviceLabels,
            hasDevices: hasDevices
        )
    }

    private static func parsePlatform(_ value: String) throws -> AutoMobilePlanExecutor.PlanPlatform {
        let normalized = unquote(value)
        guard let platform = AutoMobilePlanExecutor.PlanPlatform(rawValue: normalized) else {
            throw AutoMobilePlanExecutor.ExecutorError.invalidPlan("Unknown platform value: \(value)")
        }
        return platform
    }

    private static func indentationLevel(_ line: String) -> Int {
        return line.prefix { $0 == " " }.count
    }

    private static func indentOfNextListItem(startingAt startIndex: Int, lines: [String]) -> Int? {
        var index = startIndex
        while index < lines.count {
            let line = stripComments(from: lines[index])
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                index += 1
                continue
            }
            let indent = indentationLevel(line)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("-") {
                return indent
            }
            if indent == 0 {
                return nil
            }
            index += 1
        }
        return nil
    }

    private static func stripComments(from line: String) -> String {
        guard let hashIndex = line.firstIndex(of: "#") else {
            return line
        }
        return String(line[..<hashIndex])
    }

    private static func splitKeyValue(_ line: String) -> (String, String) {
        let parts = line.split(separator: ":", maxSplits: 1).map { String($0) }
        if parts.count == 2 {
            return (
                parts[0].trimmingCharacters(in: .whitespaces),
                unquote(parts[1].trimmingCharacters(in: .whitespaces))
            )
        }
        return (line.trimmingCharacters(in: .whitespaces), "")
    }

    private static func unquote(_ value: String) -> String {
        if value.count >= 2 {
            if (value.hasPrefix("\"") && value.hasSuffix("\"")) || (value.hasPrefix("'") && value.hasSuffix("'")) {
                return String(value.dropFirst().dropLast())
            }
        }
        return value
    }
}

extension AutoMobilePlanExecutor {
    private func resolvePlatform(from metadata: PlanMetadata) throws -> PlanPlatform {
        if metadata.hasDevices {
            let platforms = Set(metadata.devicePlatforms.values)
            if platforms.count > 1 {
                throw ExecutorError.invalidPlan(
                    "Multi-device plans with mixed platforms are not supported by XCTestRunner."
                )
            }
            if let onlyPlatform = platforms.first {
                if let declared = metadata.platform, declared != onlyPlatform {
                    throw ExecutorError.invalidPlan(
                        "Plan platform '\(declared.rawValue)' does not match device platform '\(onlyPlatform.rawValue)'."
                    )
                }
                return onlyPlatform
            }
        }

        if let declared = metadata.platform {
            return declared
        }

        return configuration.defaultPlatform
    }
}
